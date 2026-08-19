import type { Job, Queue } from "bullmq";

import {
    connectManagedQueue,
    createManagedQueue,
} from "../../shared/async/bullmq.js";
import {
    parseAnalyticsRequestOutcomeJob,
    type AnalyticsRequestOutcomeJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";

export const ANALYTICS_QUEUE_NAME = "analytics-queue";

type AnalyticsQueue = Queue<
    AnalyticsRequestOutcomeJob,
    void,
    AnalyticsRequestOutcomeJob["jobType"]
>;

let analyticsQueue: AnalyticsQueue | undefined;

export function getAnalyticsQueue(): AnalyticsQueue {
    analyticsQueue ??= createManagedQueue<
        AnalyticsRequestOutcomeJob,
        void,
        AnalyticsRequestOutcomeJob["jobType"]
    >(ANALYTICS_QUEUE_NAME);

    return analyticsQueue;
}

export async function connectAnalyticsQueue(): Promise<void> {
    await connectManagedQueue(getAnalyticsQueue());
}

export async function enqueueAnalyticsRequestOutcomeJob(
    input: unknown,
): Promise<Job<
    AnalyticsRequestOutcomeJob,
    void,
    AnalyticsRequestOutcomeJob["jobType"]
>> {
    const payload = parseAnalyticsRequestOutcomeJob(input);

    try {
        return await getAnalyticsQueue().add(
            payload.jobType,
            payload,
            {
                jobId: createAnalyticsJobId(
                    payload.jobType,
                    payload.requestId,
                ),
            },
        );
    } catch {
        logger.error(
            {
                errorCode: "BULLMQ_ENQUEUE_FAILED",
                event: "queue.job.enqueue_failed",
                jobType: payload.jobType,
                queue: ANALYTICS_QUEUE_NAME,
                requestId: payload.requestId,
            },
            "BullMQ job enqueue failed",
        );

        throw new Error("BullMQ job enqueue failed.");
    }
}

function createAnalyticsJobId(
    jobType: AnalyticsRequestOutcomeJob["jobType"],
    requestId: string,
): string {
    return `analytics-${jobType.replace(".", "-")}-${requestId}`;
}
