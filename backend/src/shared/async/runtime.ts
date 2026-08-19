import { connectAnalyticsQueue } from
    "../../features/analytics/analytics.queue.js";
import { startAnalyticsWorker } from
    "../../features/analytics/analytics.worker.js";
import { connectAnomalyQueue } from
    "../../features/anomaly/anomaly.queue.js";
import { startAnomalyWorker } from
    "../../features/anomaly/anomaly.worker.js";
import { connectBillingQueue } from
    "../../features/billing/billing.queue.js";
import { startBillingWorker } from
    "../../features/billing/billing.worker.js";
import {
    connectProviderHealthQueue,
    scheduleProviderHealthChecks,
} from "../../features/providers/provider-health.queue.js";
import { startProviderHealthWorker } from
    "../../features/providers/provider-health.worker.js";
import {
    connectEnqueueRecoveryQueue,
    scheduleEnqueueRecoveryScans,
} from "../../features/recovery/enqueue-recovery.queue.js";
import { startEnqueueRecoveryWorker } from
    "../../features/recovery/enqueue-recovery.worker.js";

export async function connectApiAsyncInfrastructure(): Promise<void> {
    await Promise.all([
        connectBillingQueue(),
        connectAnalyticsQueue(),
    ]);
}

export async function startWorkerAsyncInfrastructure(): Promise<void> {
    await Promise.all([
        connectBillingQueue(),
        connectAnalyticsQueue(),
        connectAnomalyQueue(),
        connectProviderHealthQueue(),
        connectEnqueueRecoveryQueue(),
    ]);
    await Promise.all([
        scheduleProviderHealthChecks(),
        scheduleEnqueueRecoveryScans(),
    ]);
    await Promise.all([
        startBillingWorker(),
        startAnalyticsWorker(),
        startAnomalyWorker(),
        startProviderHealthWorker(),
        startEnqueueRecoveryWorker(),
    ]);
}
