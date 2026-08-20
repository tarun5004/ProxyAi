import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";

import {
    connectManagedQueue,
    createManagedQueue,
    recordQueueEnqueued,
} from "../../shared/async/bullmq.js";
import {
    ASYNC_ENQUEUE_RECOVERY_SCAN_JOB_TYPE,
    ASYNC_JOB_SCHEMA_VERSION,
    type AsyncEnqueueRecoveryScanJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";

export const ENQUEUE_RECOVERY_QUEUE_NAME = "enqueue-recovery-queue";
export const ENQUEUE_RECOVERY_SCHEDULE_MS = 60_000;

type EnqueueRecoveryQueue = Queue<
    AsyncEnqueueRecoveryScanJob,
    void,
    typeof ASYNC_ENQUEUE_RECOVERY_SCAN_JOB_TYPE
>;

let enqueueRecoveryQueue: EnqueueRecoveryQueue | undefined;
let schedulePromise: Promise<void> | undefined;

export function getEnqueueRecoveryQueue(): EnqueueRecoveryQueue {
    enqueueRecoveryQueue ??= createManagedQueue<
        AsyncEnqueueRecoveryScanJob,
        void,
        typeof ASYNC_ENQUEUE_RECOVERY_SCAN_JOB_TYPE
    >(ENQUEUE_RECOVERY_QUEUE_NAME);

    return enqueueRecoveryQueue;
}

export async function connectEnqueueRecoveryQueue(): Promise<void> {
    await connectManagedQueue(getEnqueueRecoveryQueue());
}

export async function scheduleEnqueueRecoveryScans(): Promise<void> {
    schedulePromise ??= initializeEnqueueRecoverySchedule();

    try {
        await schedulePromise;
    } catch (error: unknown) {
        schedulePromise = undefined;
        throw error;
    }
}

async function initializeEnqueueRecoverySchedule(): Promise<void> {
    const queue = getEnqueueRecoveryQueue();

    try {
        await queue.upsertJobScheduler(
            ASYNC_ENQUEUE_RECOVERY_SCAN_JOB_TYPE,
            { every: ENQUEUE_RECOVERY_SCHEDULE_MS },
            {
                name: ASYNC_ENQUEUE_RECOVERY_SCAN_JOB_TYPE,
                data: createScanJob(),
            },
        );
        const startupJob = createScanJob();
        await queue.add(
            ASYNC_ENQUEUE_RECOVERY_SCAN_JOB_TYPE,
            startupJob,
            {
                jobId: `enqueue-recovery-startup-${startupJob.requestId}`,
            },
        );
        recordQueueEnqueued(ENQUEUE_RECOVERY_QUEUE_NAME);

        logger.info(
            {
                event: "async.enqueue_recovery.schedule_ready",
                intervalMs: ENQUEUE_RECOVERY_SCHEDULE_MS,
            },
            "Async enqueue recovery schedule ready",
        );
    } catch {
        logger.error(
            {
                errorCode: "ENQUEUE_RECOVERY_SCHEDULE_FAILED",
                event: "async.enqueue_recovery.schedule_failed",
            },
            "Async enqueue recovery schedule failed",
        );
        throw new Error("Async enqueue recovery schedule failed.");
    }
}

function createScanJob(): AsyncEnqueueRecoveryScanJob {
    return Object.freeze({
        schemaVersion: ASYNC_JOB_SCHEMA_VERSION,
        jobType: ASYNC_ENQUEUE_RECOVERY_SCAN_JOB_TYPE,
        requestId: randomUUID(),
        occurredAt: new Date().toISOString(),
    });
}
