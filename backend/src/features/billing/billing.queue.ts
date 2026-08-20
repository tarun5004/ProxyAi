import type { Job } from "bullmq";
import type { Queue } from "bullmq";

import {
    connectManagedQueue,
    createManagedQueue,
    recordQueueEnqueued,
} from "../../shared/async/bullmq.js";
import {
    parseRequestCompletedJob,
    REQUEST_COMPLETED_JOB_TYPE,
    type RequestCompletedJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";

export const BILLING_QUEUE_NAME = "billing-queue";

type BillingQueue = Queue<
    RequestCompletedJob,
    void,
    typeof REQUEST_COMPLETED_JOB_TYPE
>;

let billingQueue: BillingQueue | undefined;

export function getBillingQueue(): BillingQueue {
    billingQueue ??= createManagedQueue<
        RequestCompletedJob,
        void,
        typeof REQUEST_COMPLETED_JOB_TYPE
    >(BILLING_QUEUE_NAME);

    return billingQueue;
}

export async function connectBillingQueue(): Promise<void> {
    await connectManagedQueue(getBillingQueue());
}

export async function enqueueRequestCompletedJob(
    input: unknown,
): Promise<Job<
    RequestCompletedJob,
    void,
    typeof REQUEST_COMPLETED_JOB_TYPE
>> {
    const payload = parseRequestCompletedJob(input);
    const queue = getBillingQueue();

    try {
        const job = await queue.add(
            REQUEST_COMPLETED_JOB_TYPE,
            payload,
            {
                jobId: createBillingJobId(payload.requestId),
            },
        );

        recordQueueEnqueued(BILLING_QUEUE_NAME);
        return job;
    } catch {
        logger.error(
            {
                errorCode: "BULLMQ_ENQUEUE_FAILED",
                event: "queue.job.enqueue_failed",
                queue: BILLING_QUEUE_NAME,
                requestId: payload.requestId,
            },
            "BullMQ job enqueue failed",
        );

        throw new Error("BullMQ job enqueue failed.");
    }
}

export function createBillingJobId(requestId: string): string {
    return `billing-request-completed-${requestId}`;
}
