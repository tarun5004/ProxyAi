import {
    Queue,
    UnrecoverableError,
    Worker,
} from "bullmq";
import type {
    Job,
    Processor,
} from "bullmq";

import {
    closeRedisClient,
    createRedisClient,
    redis,
} from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { InvalidAsyncJobPayloadError } from "./job-contract.js";
import {
    createWorkerHeartbeat,
    type WorkerHealthState,
} from "./worker-heartbeat.js";

export const BULLMQ_JOB_ATTEMPTS = 3;
export const BULLMQ_BACKOFF_DELAY_MS = 1_000;
export const BULLMQ_COMPLETED_RETENTION_COUNT = 100;
export const BULLMQ_FAILED_RETENTION_COUNT = 500;

const managedQueues = new Set<Queue>();
const managedWorkers = new Set<ManagedWorker>();

export interface SafeWorkerJobContext {
    readonly jobId: string;
    readonly attemptsMade: number;
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

    return queue;
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
    await queue.close();
}

export function createManagedWorker<DataType, ResultType>(input: {
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
    const connection = createRedisClient({
        enableOfflineQueue: true,
        maxRetriesPerRequest: null,
    });
    let runPromise: Promise<void> | undefined;
    let closed = false;
    const heartbeat = input.heartbeat === undefined
        ? undefined
        : createWorkerHeartbeat({
            ...input.heartbeat,
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
                        workerId: input.heartbeat?.workerId,
                        workerType: input.heartbeat?.workerType,
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
        let data: DataType;

        try {
            data = input.parse(job.data);
        } catch (error: unknown) {
            if (error instanceof InvalidAsyncJobPayloadError) {
                throw new UnrecoverableError(
                    "Async job payload validation failed.",
                );
            }

            throw error;
        }

        const result = await input.process(
            data,
            {
                attemptsMade: job.attemptsMade,
                jobId: job.id ?? "unknown",
            },
            signal,
        );

        heartbeat?.recordSuccessfulJob();

        return result;
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
