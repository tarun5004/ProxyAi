import {
    createManagedWorker,
    type ManagedWorker,
    type SafeWorkerJobContext,
} from "../../shared/async/bullmq.js";
import {
    parseAsyncEnqueueRecoveryScanJob,
    type AsyncEnqueueRecoveryScanJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";
import { ENQUEUE_RECOVERY_QUEUE_NAME } from
    "./enqueue-recovery.queue.js";
import { runEnqueueRecoveryScan } from
    "./enqueue-recovery.service.js";

let enqueueRecoveryWorker: ManagedWorker | undefined;

export function getEnqueueRecoveryWorker(): ManagedWorker {
    enqueueRecoveryWorker ??= createManagedWorker<
        AsyncEnqueueRecoveryScanJob,
        void
    >({
        queueName: ENQUEUE_RECOVERY_QUEUE_NAME,
        parse: parseAsyncEnqueueRecoveryScanJob,
        process: processEnqueueRecoveryScanJob,
    });

    return enqueueRecoveryWorker;
}

export async function startEnqueueRecoveryWorker(): Promise<void> {
    await getEnqueueRecoveryWorker().start();
}

export async function processEnqueueRecoveryScanJob(
    job: AsyncEnqueueRecoveryScanJob,
    _context: SafeWorkerJobContext,
    _signal?: AbortSignal,
): Promise<void> {
    const result = await runEnqueueRecoveryScan();

    logger.info(
        {
            ...result,
            event: "async.enqueue_recovery.scan_completed",
            requestId: job.requestId,
        },
        "Async enqueue recovery scan completed",
    );
}
