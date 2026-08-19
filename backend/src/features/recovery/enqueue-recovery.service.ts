import type { JobState } from "bullmq";

import {
    BULLMQ_BACKOFF_DELAY_MS,
    BULLMQ_JOB_ATTEMPTS,
} from "../../shared/async/bullmq.js";
import {
    ASYNC_JOB_SCHEMA_VERSION,
    REQUEST_BLOCKED_JOB_TYPE,
    REQUEST_COMPLETED_JOB_TYPE,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";
import {
    createAnalyticsJobId,
    enqueueAnalyticsRequestOutcomeJob,
    getAnalyticsQueue,
} from "../analytics/analytics.queue.js";
import {
    createBillingJobId,
    enqueueRequestCompletedJob,
    getBillingQueue,
} from "../billing/billing.queue.js";
import type {
    EnqueueRecoveryRepository,
    EnqueueRecoveryScope,
} from "./enqueue-recovery.repository.js";
import { enqueueRecoveryRepository } from
    "./enqueue-recovery.repository.js";
import type {
    EnqueueRecoveryRecord,
    RecoveryRequestSource,
} from "./enqueue-recovery.types.js";

const RECOVERY_BATCH_SIZE = 100;
const CLAIM_WINDOW_MS = 60_000;

type RecoveryQueueJobState = JobState | "missing";

export interface EnqueueRecoveryScanResult {
    readonly discovered: number;
    readonly enqueued: number;
    readonly completed: number;
    readonly failed: number;
}

export interface EnqueueRecoveryServiceDependencies {
    readonly repository: EnqueueRecoveryRepository;
    readonly now: () => Date;
    readonly readQueueJobState: (
        record: Readonly<EnqueueRecoveryRecord>,
    ) => Promise<RecoveryQueueJobState>;
    readonly enqueue: (
        record: Readonly<EnqueueRecoveryRecord>,
        source: Readonly<RecoveryRequestSource>,
    ) => Promise<void>;
}

const defaultDependencies: EnqueueRecoveryServiceDependencies = {
    repository: enqueueRecoveryRepository,
    now: () => new Date(),
    readQueueJobState: readExistingQueueJobState,
    enqueue: enqueueRecoveredJob,
};

export async function recordFailedEnqueue(
    scope: EnqueueRecoveryScope,
    dependencies: Pick<
        EnqueueRecoveryServiceDependencies,
        "repository" | "now"
    > = defaultDependencies,
): Promise<void> {
    await dependencies.repository.ensurePending(
        scope,
        dependencies.now(),
        "ENQUEUE_UNAVAILABLE",
    );

    logger.warn(
        {
            event: "async.enqueue_recovery.pending",
            jobType: scope.jobType,
            orgId: scope.orgId,
            queue: scope.queueName,
            requestId: scope.requestId,
        },
        "Async enqueue recovery recorded",
    );
}

export async function runEnqueueRecoveryScan(
    dependencies: EnqueueRecoveryServiceDependencies = defaultDependencies,
): Promise<EnqueueRecoveryScanResult> {
    const organisationIds = await dependencies.repository.listOrganisationIds();
    let discovered = 0;
    let enqueued = 0;
    let completed = 0;
    let failed = 0;

    for (const orgId of organisationIds) {
        discovered += await discoverMissingRecoveryRecords(
            orgId,
            dependencies,
        );

        const records = await dependencies.repository.listOpen(
            orgId,
            dependencies.now(),
            RECOVERY_BATCH_SIZE,
        );

        for (const record of records) {
            const result = await recoverRecord(record, dependencies);

            enqueued += result === "ENQUEUED" ? 1 : 0;
            completed += result === "COMPLETED" ? 1 : 0;
            failed += result === "FAILED" ? 1 : 0;
        }
    }

    return Object.freeze({ discovered, enqueued, completed, failed });
}

async function discoverMissingRecoveryRecords(
    orgId: string,
    dependencies: EnqueueRecoveryServiceDependencies,
): Promise<number> {
    let afterCursor: string | undefined;
    let discovered = 0;

    do {
        const records = await dependencies.repository.listRequestLogBatch(
            orgId,
            afterCursor,
            RECOVERY_BATCH_SIZE,
        );

        for (const source of records) {
            for (const scope of expectedRecoveryScopes(source)) {
                await dependencies.repository.ensurePending(
                    scope,
                    dependencies.now(),
                );
                discovered += 1;
            }
        }

        afterCursor = records.at(-1)?.cursorId;

        if (records.length < RECOVERY_BATCH_SIZE) {
            break;
        }
    } while (afterCursor !== undefined);

    return discovered;
}

async function recoverRecord(
    record: Readonly<EnqueueRecoveryRecord>,
    dependencies: EnqueueRecoveryServiceDependencies,
): Promise<"SKIPPED" | "ENQUEUED" | "COMPLETED" | "FAILED"> {
    const scope = toScope(record);
    const now = dependencies.now();
    const source = await dependencies.repository.findRequestSource(
        record.orgId,
        record.requestId,
    );

    if (source === undefined) {
        await dependencies.repository.markFailed(
            scope,
            now,
            "SOURCE_UNAVAILABLE",
        );
        emitRecoveryFailure(record, "SOURCE_UNAVAILABLE");
        return "FAILED";
    }

    const ledgerState = await dependencies.repository
        .findBusinessLedgerState(scope);

    if (ledgerState === "COMPLETED") {
        await dependencies.repository.markCompleted(scope, now);
        return "COMPLETED";
    }

    if (ledgerState === "PROCESSING") {
        await dependencies.repository.markEnqueued(
            scope,
            nextCheckAt(now),
        );
        return "SKIPPED";
    }

    const queueState = await dependencies.readQueueJobState(record);

    if (queueState === "failed") {
        await dependencies.repository.markFailed(
            scope,
            now,
            "TERMINAL_JOB_FAILURE",
        );
        emitRecoveryFailure(record, "TERMINAL_JOB_FAILURE");
        return "FAILED";
    }

    if (queueState !== "missing") {
        await dependencies.repository.markEnqueued(
            scope,
            nextCheckAt(now),
        );
        return "SKIPPED";
    }

    const claimed = await dependencies.repository.claimAttempt(
        scope,
        now,
        new Date(now.getTime() + CLAIM_WINDOW_MS),
    );

    if (claimed === undefined) {
        return "SKIPPED";
    }

    try {
        await dependencies.enqueue(claimed, source);
        await dependencies.repository.markEnqueued(
            scope,
            nextCheckAt(now),
        );

        logger.info(
            {
                attemptCount: claimed.attemptCount,
                event: "async.enqueue_recovery.enqueued",
                jobType: claimed.jobType,
                orgId: claimed.orgId,
                queue: claimed.queueName,
                requestId: claimed.requestId,
            },
            "Recovered async job enqueue",
        );

        return "ENQUEUED";
    } catch {
        if (claimed.attemptCount >= BULLMQ_JOB_ATTEMPTS) {
            await dependencies.repository.markFailed(
                scope,
                now,
                "ENQUEUE_UNAVAILABLE",
            );
            emitRecoveryFailure(claimed, "ENQUEUE_UNAVAILABLE");
            return "FAILED";
        }

        await dependencies.repository.markPendingRetry(
            scope,
            new Date(now.getTime() + recoveryBackoffMs(claimed.attemptCount)),
            "ENQUEUE_UNAVAILABLE",
        );
        return "SKIPPED";
    }
}

function expectedRecoveryScopes(
    source: Readonly<RecoveryRequestSource>,
): readonly EnqueueRecoveryScope[] {
    const analyticsScope: EnqueueRecoveryScope = {
        orgId: source.orgId,
        requestId: source.requestId,
        queueName: "analytics-queue",
        jobType: source.status === "BLOCKED"
            ? REQUEST_BLOCKED_JOB_TYPE
            : REQUEST_COMPLETED_JOB_TYPE,
    };

    if (source.status === "BLOCKED") {
        return [analyticsScope];
    }

    return [
        {
            orgId: source.orgId,
            requestId: source.requestId,
            queueName: "billing-queue",
            jobType: REQUEST_COMPLETED_JOB_TYPE,
        },
        analyticsScope,
    ];
}

async function readExistingQueueJobState(
    record: Readonly<EnqueueRecoveryRecord>,
): Promise<RecoveryQueueJobState> {
    const job = record.queueName === "billing-queue"
        ? await getBillingQueue().getJob(createBillingJobId(record.requestId))
        : await getAnalyticsQueue().getJob(
            createAnalyticsJobId(record.jobType, record.requestId),
        );

    if (job === undefined) {
        return "missing";
    }

    const state = await job.getState();

    return state === "unknown" ? "missing" : state;
}

async function enqueueRecoveredJob(
    record: Readonly<EnqueueRecoveryRecord>,
    source: Readonly<RecoveryRequestSource>,
): Promise<void> {
    if (record.jobType === REQUEST_BLOCKED_JOB_TYPE) {
        await enqueueAnalyticsRequestOutcomeJob({
            schemaVersion: ASYNC_JOB_SCHEMA_VERSION,
            jobType: REQUEST_BLOCKED_JOB_TYPE,
            requestId: source.requestId,
            orgId: source.orgId,
            userId: source.userId,
            status: "BLOCKED",
            policyAction: "BLOCK",
            occurredAt: source.createdAt.toISOString(),
        });
        return;
    }

    if (source.providerId === undefined || source.model === undefined) {
        throw new Error("Recovery source provider metadata is unavailable.");
    }

    const payload = {
        schemaVersion: ASYNC_JOB_SCHEMA_VERSION,
        jobType: REQUEST_COMPLETED_JOB_TYPE,
        requestId: source.requestId,
        orgId: source.orgId,
        userId: source.userId,
        status: source.status,
        policyAction: source.policyAction,
        providerId: source.providerId,
        model: source.model,
        ...(hasCompleteUsage(source)
            ? {
                usage: {
                    inputTokens: source.inputTokens,
                    outputTokens: source.outputTokens,
                    totalTokens: source.totalTokens,
                },
            }
            : {}),
        occurredAt: source.createdAt.toISOString(),
    } as const;

    if (record.queueName === "billing-queue") {
        await enqueueRequestCompletedJob(payload);
        return;
    }

    await enqueueAnalyticsRequestOutcomeJob(payload);
}

function hasCompleteUsage(source: Readonly<RecoveryRequestSource>): source is
    Readonly<RecoveryRequestSource> & {
        readonly inputTokens: number;
        readonly outputTokens: number;
        readonly totalTokens: number;
    } {
    return source.inputTokens !== undefined
        && source.outputTokens !== undefined
        && source.totalTokens !== undefined;
}

function recoveryBackoffMs(attemptCount: number): number {
    return BULLMQ_BACKOFF_DELAY_MS * (2 ** Math.max(0, attemptCount - 1));
}

function nextCheckAt(now: Date): Date {
    return new Date(now.getTime() + CLAIM_WINDOW_MS);
}

function toScope(
    record: Readonly<EnqueueRecoveryRecord>,
): EnqueueRecoveryScope {
    return {
        orgId: record.orgId,
        requestId: record.requestId,
        queueName: record.queueName,
        jobType: record.jobType,
    };
}

function emitRecoveryFailure(
    record: Readonly<EnqueueRecoveryRecord>,
    errorCategory: string,
): void {
    logger.error(
        {
            errorCategory,
            event: "async.enqueue_recovery.failed",
            jobType: record.jobType,
            orgId: record.orgId,
            queue: record.queueName,
            requestId: record.requestId,
        },
        "Async enqueue recovery failed",
    );
}
