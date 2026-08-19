import {
    createManagedWorker,
    type ManagedWorker,
    type SafeWorkerJobContext,
} from "../../shared/async/bullmq.js";
import {
    parseProviderHealthCheckJob,
    type ProviderHealthCheckJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import {
    mapProviderHealthStatus,
    writeProviderHealth,
    type ProviderHealthRecord,
} from "./provider-health.store.js";
import { PROVIDER_HEALTH_QUEUE_NAME } from
    "./provider-health.queue.js";
import { getEnabledProductionProviderAdapter } from
    "./provider-runtime.registry.js";
import type { EnabledProductionProviderId } from "./provider.types.js";

export interface ProviderHealthWorkerDependencies {
    readonly getAdapter: (
        providerId: EnabledProductionProviderId,
    ) => ProviderAdapter;
    readonly writeHealth: (
        providerId: EnabledProductionProviderId,
        record: Required<ProviderHealthRecord>,
    ) => Promise<void>;
    readonly now: () => Date;
}

const defaultProviderHealthWorkerDependencies: ProviderHealthWorkerDependencies = {
    getAdapter: getEnabledProductionProviderAdapter,
    writeHealth: writeProviderHealth,
    now: () => new Date(),
};

let providerHealthWorker: ManagedWorker | undefined;

export function getProviderHealthWorker(): ManagedWorker {
    providerHealthWorker ??= createManagedWorker<
        ProviderHealthCheckJob,
        void
    >({
        queueName: PROVIDER_HEALTH_QUEUE_NAME,
        parse: parseProviderHealthCheckJob,
        process: processProviderHealthCheckJob,
    });

    return providerHealthWorker;
}

export async function startProviderHealthWorker(): Promise<void> {
    await getProviderHealthWorker().start();
}

export async function processProviderHealthCheckJob(
    job: ProviderHealthCheckJob,
    _context: SafeWorkerJobContext,
    _signal?: AbortSignal,
    dependencies: ProviderHealthWorkerDependencies =
        defaultProviderHealthWorkerDependencies,
): Promise<void> {
    const adapter = dependencies.getAdapter(job.providerId);
    let record: Required<ProviderHealthRecord>;

    try {
        const health = await adapter.checkHealth();

        record = {
            state: health.providerId === job.providerId
                ? mapProviderHealthStatus(health.status)
                : "UNKNOWN",
            checkedAt: dependencies.now().toISOString(),
        };
    } catch {
        record = {
            state: "UNKNOWN",
            checkedAt: dependencies.now().toISOString(),
        };
    }

    await dependencies.writeHealth(job.providerId, record);

    logger.info(
        {
            event: "provider.health.updated",
            providerId: job.providerId,
            requestId: job.requestId,
            state: record.state,
        },
        "Provider health state updated",
    );
}
