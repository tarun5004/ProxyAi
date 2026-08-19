import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";

import {
    connectManagedQueue,
    createManagedQueue,
} from "../../shared/async/bullmq.js";
import {
    ASYNC_JOB_SCHEMA_VERSION,
    PROVIDER_HEALTH_CHECK_JOB_TYPE,
    type ProviderHealthCheckJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";
import { getEnabledProductionProviderIds } from
    "./provider-runtime.registry.js";

export const PROVIDER_HEALTH_QUEUE_NAME = "health-check-queue";
export const PROVIDER_HEALTH_SCHEDULE_MS = 60_000;

type ProviderHealthQueue = Queue<
    ProviderHealthCheckJob,
    void,
    string
>;

let providerHealthQueue: ProviderHealthQueue | undefined;

export function getProviderHealthQueue(): ProviderHealthQueue {
    providerHealthQueue ??= createManagedQueue<
        ProviderHealthCheckJob,
        void,
        string
    >(PROVIDER_HEALTH_QUEUE_NAME);

    return providerHealthQueue;
}

export async function connectProviderHealthQueue(): Promise<void> {
    await connectManagedQueue(getProviderHealthQueue());
}

export async function scheduleProviderHealthChecks(): Promise<void> {
    const queue = getProviderHealthQueue();

    try {
        await Promise.all(getEnabledProductionProviderIds().map(
            async (providerId) => queue.upsertJobScheduler(
                `${PROVIDER_HEALTH_CHECK_JOB_TYPE}:${providerId}`,
                { every: PROVIDER_HEALTH_SCHEDULE_MS },
                {
                    name: PROVIDER_HEALTH_CHECK_JOB_TYPE,
                    data: {
                        schemaVersion: ASYNC_JOB_SCHEMA_VERSION,
                        jobType: PROVIDER_HEALTH_CHECK_JOB_TYPE,
                        requestId: randomUUID(),
                        providerId,
                        occurredAt: new Date().toISOString(),
                    },
                },
            ),
        ));

        logger.info(
            {
                event: "provider.health.schedule_ready",
                intervalMs: PROVIDER_HEALTH_SCHEDULE_MS,
                providerCount: getEnabledProductionProviderIds().length,
            },
            "Provider health schedule ready",
        );
    } catch {
        logger.error(
            {
                errorCode: "PROVIDER_HEALTH_SCHEDULE_FAILED",
                event: "provider.health.schedule_failed",
            },
            "Provider health schedule failed",
        );

        throw new Error("Provider health schedule failed.");
    }
}
