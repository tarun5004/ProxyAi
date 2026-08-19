import { UnrecoverableError } from "bullmq";

import {
    createManagedWorker,
    type ManagedWorker,
    type SafeWorkerJobContext,
} from "../../shared/async/bullmq.js";
import {
    parseUsageUpdatedJob,
    type UsageUpdatedJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";
import {
    anomalyRepository,
    type AnomalyRepository,
} from "./anomaly.repository.js";
import { ANOMALY_QUEUE_NAME } from "./anomaly.queue.js";
import type { DailyUserTokenUsage } from "./anomaly.types.js";

export const ANOMALY_WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
export const ANOMALY_WORKER_HEARTBEAT_FRESHNESS_MS = 120_000;
export const ANOMALY_BASELINE_WINDOW_DAYS = 7;
export const ANOMALY_MINIMUM_ACTIVE_DAYS = 3;
export const ANOMALY_THRESHOLD_MULTIPLIER = 2 as const;

export type AnomalyJobProcessingResult =
    | "ALERT_RECORDED"
    | "NO_ANOMALY"
    | "SKIPPED_FEATURE_DISABLED"
    | "SKIPPED_CURRENT_USAGE_UNAVAILABLE"
    | "SKIPPED_INSUFFICIENT_BASELINE";

export interface AnomalyWorkerDependencies {
    readonly repository: AnomalyRepository;
}

const defaultAnomalyWorkerDependencies: AnomalyWorkerDependencies = {
    repository: anomalyRepository,
};

let anomalyWorker: ManagedWorker | undefined;

export function getAnomalyWorker(): ManagedWorker {
    anomalyWorker ??= createManagedWorker<
        UsageUpdatedJob,
        AnomalyJobProcessingResult
    >({
        queueName: ANOMALY_QUEUE_NAME,
        parse: parseUsageUpdatedJob,
        process: processUsageUpdatedAnomalyJob,
        heartbeat: {
            workerId: "anomaly-worker",
            workerType: "anomaly",
            intervalMs: ANOMALY_WORKER_HEARTBEAT_INTERVAL_MS,
            freshnessMs: ANOMALY_WORKER_HEARTBEAT_FRESHNESS_MS,
        },
    });

    return anomalyWorker;
}

export async function startAnomalyWorker(): Promise<void> {
    await getAnomalyWorker().start();
}

export async function processUsageUpdatedAnomalyJob(
    job: UsageUpdatedJob,
    context: SafeWorkerJobContext,
    _signal?: AbortSignal,
    dependencies: AnomalyWorkerDependencies =
        defaultAnomalyWorkerDependencies,
): Promise<AnomalyJobProcessingResult> {
    try {
        const featureEnabled =
            await dependencies.repository.getFeatureState(job.orgId);

        if (featureEnabled === null) {
            throw new UnrecoverableError(
                "Trusted organisation state is unavailable.",
            );
        }

        if (!featureEnabled) {
            return "SKIPPED_FEATURE_DISABLED";
        }

        const currentUsage = await dependencies.repository.findDailyUsage({
            orgId: job.orgId,
            userId: job.userId,
            observedDay: job.observedDay,
        });

        if (currentUsage === null) {
            throw new UnrecoverableError(
                "Current analytics aggregate is unavailable.",
            );
        }

        if (!hasCompleteCurrentUsage(currentUsage)) {
            return "SKIPPED_CURRENT_USAGE_UNAVAILABLE";
        }

        const baselineWindowStart = subtractUtcDays(
            job.observedDay,
            ANOMALY_BASELINE_WINDOW_DAYS,
        );
        const baselineDays =
            await dependencies.repository.findPriorActiveDays({
                orgId: job.orgId,
                userId: job.userId,
                baselineWindowStart,
                observedDay: job.observedDay,
            });

        if (baselineDays.length < ANOMALY_MINIMUM_ACTIVE_DAYS) {
            return "SKIPPED_INSUFFICIENT_BASELINE";
        }

        const baselineTotalTokens = baselineDays.reduce(
            (total, day) => total + BigInt(day.totalTokens),
            0n,
        );
        const baselineActiveDays = baselineDays.length;
        const observedWeighted =
            BigInt(currentUsage.totalTokens) * BigInt(baselineActiveDays);
        const approvedThreshold =
            BigInt(ANOMALY_THRESHOLD_MULTIPLIER) * baselineTotalTokens;

        if (observedWeighted <= approvedThreshold) {
            return "NO_ANOMALY";
        }

        const alert = await dependencies.repository.upsertDailyAnomalyAlert({
            orgId: job.orgId,
            userId: job.userId,
            observedDay: job.observedDay,
            metadata: {
                observedTokens: currentUsage.totalTokens,
                baselineAverageTokens: calculateAverage(
                    baselineTotalTokens,
                    baselineActiveDays,
                ),
                baselineActiveDays,
                baselineWindowStart,
                baselineWindowEnd: subtractUtcDays(job.observedDay, 1),
                thresholdMultiplier: ANOMALY_THRESHOLD_MULTIPLIER,
            },
        });

        logger.info(
            {
                alertId: alert.alertId,
                event: "anomaly.daily_token_usage.detected",
                orgId: job.orgId,
                observedDay: job.observedDay,
                requestId: job.requestId,
                severity: "HIGH",
                userId: job.userId,
            },
            "Daily token usage anomaly detected",
        );

        return "ALERT_RECORDED";
    } catch (error: unknown) {
        logger.warn(
            {
                attemptsMade: context.attemptsMade,
                errorCategory: error instanceof UnrecoverableError
                    ? "TERMINAL"
                    : "TRANSIENT",
                event: "anomaly.job.processing_failed",
                jobType: job.jobType,
                orgId: job.orgId,
                requestId: job.requestId,
                userId: job.userId,
            },
            "Anomaly job processing failed",
        );

        if (error instanceof UnrecoverableError) {
            throw error;
        }

        throw new Error("Anomaly job processing failed.");
    }
}

function hasCompleteCurrentUsage(usage: DailyUserTokenUsage): boolean {
    return usage.knownUsageRequestCount > 0
        && usage.unknownUsageRequestCount === 0;
}

function calculateAverage(total: bigint, count: number): number {
    const divisor = BigInt(count);
    const quotient = total / divisor;
    const remainder = total % divisor;

    return Number(quotient) + Number(remainder) / count;
}

function subtractUtcDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - days);

    return value.toISOString().slice(0, 10);
}
