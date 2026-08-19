import { createHash } from "node:crypto";

import type { Job, Queue } from "bullmq";

import {
    connectManagedQueue,
    createManagedQueue,
} from "../../shared/async/bullmq.js";
import {
    parseUsageUpdatedJob,
    type UsageUpdatedJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";

export const ANOMALY_QUEUE_NAME = "anomaly-queue";

type AnomalyQueue = Queue<
    UsageUpdatedJob,
    void,
    UsageUpdatedJob["jobType"]
>;

let anomalyQueue: AnomalyQueue | undefined;

export function getAnomalyQueue(): AnomalyQueue {
    anomalyQueue ??= createManagedQueue<
        UsageUpdatedJob,
        void,
        UsageUpdatedJob["jobType"]
    >(ANOMALY_QUEUE_NAME);

    return anomalyQueue;
}

export async function connectAnomalyQueue(): Promise<void> {
    await connectManagedQueue(getAnomalyQueue());
}

export async function enqueueUsageUpdatedJob(
    input: unknown,
): Promise<Job<UsageUpdatedJob, void, UsageUpdatedJob["jobType"]>> {
    const payload = parseUsageUpdatedJob(input);

    try {
        return await getAnomalyQueue().add(
            payload.jobType,
            payload,
            {
                jobId: createAnomalyJobId(payload),
            },
        );
    } catch {
        logger.error(
            {
                errorCode: "BULLMQ_ENQUEUE_FAILED",
                event: "queue.job.enqueue_failed",
                jobType: payload.jobType,
                queue: ANOMALY_QUEUE_NAME,
                requestId: payload.requestId,
            },
            "BullMQ job enqueue failed",
        );

        throw new Error("BullMQ job enqueue failed.");
    }
}

function createAnomalyJobId(payload: UsageUpdatedJob): string {
    const scopeDigest = createHash("sha256")
        .update(payload.orgId)
        .update("\0")
        .update(payload.userId)
        .update("\0")
        .update(payload.requestId)
        .digest("hex");

    return `anomaly-usage-updated-${scopeDigest}`;
}
