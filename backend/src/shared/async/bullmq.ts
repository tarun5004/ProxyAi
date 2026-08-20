import {
    Queue,
    UnrecoverableError,
    Worker,
} from "bullmq";
import type {
    Job,
    Processor,
} from "bullmq";
import type { Logger } from "pino";

import {
    closeRedisClient,
    createRedisClient,
    redis,
} from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import {
    APPROVED_METRIC_LABEL_VALUES,
    metrics,
} from "../observability/metrics.js";
import { InvalidAsyncJobPayloadError } from "./job-contract.js";
import {
    createWorkerHeartbeat,
    type WorkerHealthState,
} from "./worker-heartbeat.js";

export const BULLMQ_JOB_ATTEMPTS = 3;
export const BULLMQ_BACKOFF_DELAY_MS = 1_000;
export const BULLMQ_COMPLETED_RETENTION_COUNT = 100;
export const BULLMQ_FAILED_RETENTION_COUNT = 500;
export const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
export const WORKER_HEARTBEAT_FRESHNESS_MS = 120_000;

const managedQueues = new Set<Queue>();
const managedWorkers = new Set<ManagedWorker>();
const instrumentedQueues = new Map<ApprovedQueueName, Queue>();

type ApprovedQueueName =
    (typeof APPROVED_METRIC_LABEL_VALUES.queues)[number];
type ApprovedQueueOutcome =
    (typeof APPROVED_METRIC_LABEL_VALUES.queueOutcomes)[number];
type ApprovedQueueDurationOutcome =
    (typeof APPROVED_METRIC_LABEL_VALUES.queueDurationOutcomes)[number];
type ApprovedWorkerName =
    (typeof APPROVED_METRIC_LABEL_VALUES.workers)[number];

const WORKER_BY_QUEUE: Readonly<Record<ApprovedQueueName, ApprovedWorkerName>> =
    Object.freeze({
        "billing-queue": "billing",
        "analytics-queue": "analytics",
        "anomaly-queue": "anomaly",
        "health-check-queue": "provider_health",
        "enqueue-recovery-queue": "enqueue_recovery",
    });

(metrics.queueDepth as unknown as {
    collect?: () => Promise<void>;
}).collect = collectQueueDepthMetrics;

export interface SafeWorkerJobContext {
    readonly requestId: string;
    readonly jobId: string;
    readonly attemptsMade: number;
    readonly log: Logger;
}

export interface ManagedWorker {
    start(): Promise<void>;
    close(): Promise<void>;
    getHealth(): WorkerHealthState | undefined;
}

export function createManagedQueue<
    DataType,
    ResultType = void,
    NameType extends string = string,
>(name: string): Queue<DataType, ResultType, NameType> {
    const queue = new Queue<DataType, ResultType, NameType>(name, {
        connection: redis,
        defaultJobOptions: {
            attempts: BULLMQ_JOB_ATTEMPTS,
            backoff: {
                type: "exponential",
                delay: BULLMQ_BACKOFF_DELAY_MS,
            },
            removeOnComplete: BULLMQ_COMPLETED_RETENTION_COUNT,
            removeOnFail: BULLMQ_FAILED_RETENTION_COUNT,
        },
        skipWaitingForReady: true,
    });

    queue.on("error", () => {
        logger.error(
            {
                errorCode: "BULLMQ_QUEUE_ERROR",
                event: "queue.connection.error",
                queue: name,
            },
            "BullMQ queue error",
        );
    });

    managedQueues.add(queue);

    const approvedQueueName = getApprovedQueueName(name);

    if (approvedQueueName !== undefined) {
        instrumentedQueues.set(approvedQueueName, queue);
    }

    return queue;
}

export function recordQueueEnqueued(queueName: string): void {
    observeQueueJob(queueName, "enqueued");
}

export async function connectManagedQueue(queue: Queue): Promise<void> {
    try {
        await queue.waitUntilReady();

        logger.info(
            {
                event: "queue.connected",
                queue: queue.name,
            },
            "BullMQ queue connected",
        );
    } catch {
        logger.error(
            {
                errorCode: "BULLMQ_CONNECTION_FAILED",
                event: "queue.connection.failed",
                queue: queue.name,
            },
            "BullMQ queue connection failed",
        );

        throw new Error("BullMQ queue connection failed.");
    }
}

export async function closeManagedQueue(queue: Queue): Promise<void> {
    managedQueues.delete(queue);

    const approvedQueueName = getApprovedQueueName(queue.name);

    if (approvedQueueName !== undefined
        && instrumentedQueues.get(approvedQueueName) === queue) {
        instrumentedQueues.delete(approvedQueueName);
    }

    await queue.close();
}

export function createManagedWorker<
    DataType extends { readonly requestId: string },
    ResultType,
>(input: {
    readonly queueName: string;
    readonly parse: (value: unknown) => DataType;
    readonly process: (
        data: DataType,
        context: SafeWorkerJobContext,
        signal?: AbortSignal,
    ) => Promise<ResultType>;
    readonly heartbeat?: {
        readonly workerId: string;
        readonly workerType: string;
        readonly intervalMs: number;
        readonly freshnessMs: number;
    };
}): ManagedWorker {
    const approvedQueueName = getApprovedQueueName(input.queueName);
    const approvedWorkerName = approvedQueueName === undefined
        ? undefined
        : WORKER_BY_QUEUE[approvedQueueName];
    const connection = createRedisClient({
        enableOfflineQueue: true,
        maxRetriesPerRequest: null,
    });
    let runPromise: Promise<void> | undefined;
    let closed = false;
    const heartbeatConfig = input.heartbeat ?? (
        approvedWorkerName === undefined
            ? undefined
            : {
                workerId: `${approvedWorkerName.replace("_", "-")}-worker`,
                workerType: approvedWorkerName,
                intervalMs: WORKER_HEARTBEAT_INTERVAL_MS,
                freshnessMs: WORKER_HEARTBEAT_FRESHNESS_MS,
            }
    );
    const heartbeat = heartbeatConfig === undefined
        ? undefined
        : createWorkerHeartbeat({
            ...heartbeatConfig,
            probe: async () => {
                const response = await connection.ping();

                if (response !== "PONG") {
                    throw new Error("BullMQ worker heartbeat failed.");
                }
            },
            onFailure: () => {
                logger.error(
                    {
                        errorCode: "BULLMQ_WORKER_HEARTBEAT_FAILED",
                        event: "queue.worker.heartbeat_failed",
                        queue: input.queueName,
                        workerId: heartbeatConfig.workerId,
                        workerType: heartbeatConfig.workerType,
                    },
                    "BullMQ worker heartbeat failed",
                );
            },
        });

    const processor: Processor<unknown, ResultType> = async (
        job: Job<unknown>,
        _token?: string,
        signal?: AbortSignal,
    ) => {
        const startedAt = process.hrtime.bigint();
        let data: DataType;

        try {
            data = input.parse(job.data);
        } catch (error: unknown) {
            if (error instanceof InvalidAsyncJobPayloadError) {
                observeQueueAttempt(
                    input.queueName,
                    "invalid_payload",
                    "invalid_payload",
                    startedAt,
                );
                throw new UnrecoverableError(
                    "Async job payload validation failed.",
                );
            }

            observeQueueFailure(input.queueName, job, error, startedAt);
            throw error;
        }

        const jobContext: SafeWorkerJobContext = {
            attemptsMade: job.attemptsMade,
            jobId: job.id ?? "unknown",
            requestId: data.requestId,
            log: logger.child({
                jobId: job.id ?? "unknown",
                queue: input.queueName,
                requestId: data.requestId,
                service: "proxiai-worker",
            }),
        };

        jobContext.log.info(
            {
                attemptsMade: job.attemptsMade,
                event: "queue.job.started",
            },
            "BullMQ job processing started",
        );

        try {
            const result = await input.process(data, jobContext, signal);

            heartbeat?.recordSuccessfulJob();
            observeQueueAttempt(
                input.queueName,
                "completed",
                "completed",
                startedAt,
            );
            jobContext.log.info(
                {
                    event: "queue.job.completed",
                },
                "BullMQ job processing completed",
            );

            return result;
        } catch (error: unknown) {
            observeQueueFailure(input.queueName, job, error, startedAt);
            jobContext.log.warn(
                {
                    attemptsMade: job.attemptsMade,
                    errorCode: error instanceof UnrecoverableError
                        ? "ASYNC_JOB_TERMINAL_FAILURE"
                        : "ASYNC_JOB_PROCESSING_FAILED",
                    event: "queue.job.processing_failed",
                },
                "BullMQ job processing failed",
            );
            throw error;
        }
    };
    const worker = new Worker<unknown, ResultType>(
        input.queueName,
        processor,
        {
            autorun: false,
            connection,
            removeOnComplete: {
                count: BULLMQ_COMPLETED_RETENTION_COUNT,
            },
            removeOnFail: {
                count: BULLMQ_FAILED_RETENTION_COUNT,
            },
        },
    );

    worker.on("error", () => {
        logger.error(
            {
                errorCode: "BULLMQ_WORKER_ERROR",
                event: "queue.worker.error",
                queue: input.queueName,
            },
            "BullMQ worker error",
        );
    });

    worker.on("failed", (job) => {
        logger.warn(
            {
                attemptsMade: job?.attemptsMade,
                event: "queue.job.failed",
                jobId: job?.id,
                queue: input.queueName,
            },
            "BullMQ job failed",
        );
    });

    const managedWorker: ManagedWorker = {
        async start() {
            if (closed) {
                throw new Error("BullMQ worker is closed.");
            }

            if (runPromise !== undefined) {
                return;
            }

            runPromise = worker.run();
            void runPromise.catch(() => {
                void heartbeat?.stop();

                logger.error(
                    {
                        errorCode: "BULLMQ_WORKER_RUN_FAILED",
                        event: "queue.worker.run_failed",
                        queue: input.queueName,
                    },
                    "BullMQ worker stopped unexpectedly",
                );
            });

            try {
                await worker.waitUntilReady();
                heartbeat?.start();

                logger.info(
                    {
                        event: "queue.worker.started",
                        queue: input.queueName,
                    },
                    "BullMQ worker started",
                );
            } catch {
                await managedWorker.close();
                throw new Error("BullMQ worker startup failed.");
            }
        },
        async close() {
            if (closed) {
                return;
            }

            closed = true;
            managedWorkers.delete(managedWorker);
            await heartbeat?.stop();
            await worker.close();
            await runPromise?.catch(() => undefined);
            await closeRedisClient(connection);

            logger.info(
                {
                    event: "queue.worker.stopped",
                    queue: input.queueName,
                },
                "BullMQ worker stopped",
            );
        },
        getHealth() {
            return heartbeat?.getHealth();
        },
    };

    managedWorkers.add(managedWorker);

    return managedWorker;
}

export async function disconnectBullMq(): Promise<void> {
    const results = await Promise.allSettled([
        ...[...managedWorkers].map((worker) => worker.close()),
        ...[...managedQueues].map((queue) => closeManagedQueue(queue)),
    ]);

    if (results.some((result) => result.status === "rejected")) {
        throw new Error("BullMQ shutdown failed.");
    }
}

async function collectQueueDepthMetrics(): Promise<void> {
    metrics.queueDepth.reset();

    await Promise.all([...instrumentedQueues].map(async ([queueName, queue]) => {
        try {
            const counts = await queue.getJobCounts(
                ...APPROVED_METRIC_LABEL_VALUES.queueDepthStates,
            );

            for (const state of APPROVED_METRIC_LABEL_VALUES.queueDepthStates) {
                metrics.queueDepth.set(
                    { queue: queueName, state },
                    counts[state] ?? 0,
                );
            }
        } catch {
            for (const state of APPROVED_METRIC_LABEL_VALUES.queueDepthStates) {
                metrics.queueDepth.remove(queueName, state);
            }
        }
    }));
}

function observeQueueFailure(
    queueName: string,
    job: Job<unknown>,
    error: unknown,
    startedAt: bigint,
): void {
    const attempts = job.opts.attempts ?? 1;
    const willRetry = !(error instanceof UnrecoverableError)
        && job.attemptsMade + 1 < attempts;

    observeQueueAttempt(
        queueName,
        willRetry ? "retried" : "failed",
        willRetry ? "retryable_failure" : "terminal_failure",
        startedAt,
    );
}

function observeQueueAttempt(
    queueName: string,
    outcome: ApprovedQueueOutcome,
    durationOutcome: ApprovedQueueDurationOutcome,
    startedAt: bigint,
): void {
    const approvedQueueName = getApprovedQueueName(queueName);

    if (approvedQueueName === undefined) {
        return;
    }

    metrics.queueJobsTotal.inc({
        queue: approvedQueueName,
        outcome,
    });
    metrics.queueJobDurationSeconds.observe(
        {
            queue: approvedQueueName,
            outcome: durationOutcome,
        },
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
    );
}

function observeQueueJob(
    queueName: string,
    outcome: ApprovedQueueOutcome,
): void {
    const approvedQueueName = getApprovedQueueName(queueName);

    if (approvedQueueName !== undefined) {
        metrics.queueJobsTotal.inc({
            queue: approvedQueueName,
            outcome,
        });
    }
}

function getApprovedQueueName(queueName: string): ApprovedQueueName | undefined {
    return APPROVED_METRIC_LABEL_VALUES.queues.find(
        (approvedQueueName) => approvedQueueName === queueName,
    );
}
