import { UnrecoverableError } from "bullmq";
import {
    createManagedWorker,
    type ManagedWorker,
    type SafeWorkerJobContext,
} from "../../shared/async/bullmq.js";
import {
    parseAnalyticsRequestOutcomeJob,
    type AnalyticsRequestOutcomeJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";
import {
    analyticsRepository,
    type AnalyticsRepository,
} from "./analytics.repository.js";
import { ANALYTICS_QUEUE_NAME } from "./analytics.queue.js";

export const ANALYTICS_WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
export const ANALYTICS_WORKER_HEARTBEAT_FRESHNESS_MS = 120_000;

export type AnalyticsJobProcessingResult =
    | "APPLIED"
    | "SKIPPED_COMPLETED"
    | "SKIPPED_PROCESSING";

export interface AnalyticsWorkerDependencies {
    readonly repository: AnalyticsRepository;
    readonly now: () => Date;
}

const defaultAnalyticsWorkerDependencies: AnalyticsWorkerDependencies = {
    repository: analyticsRepository,
    now: () => new Date(),
};

let analyticsWorker: ManagedWorker | undefined;

export function getAnalyticsWorker(): ManagedWorker {
    analyticsWorker ??= createManagedWorker<
        AnalyticsRequestOutcomeJob,
        AnalyticsJobProcessingResult
    >({
        queueName: ANALYTICS_QUEUE_NAME,
        parse: parseAnalyticsRequestOutcomeJob,
        process: processAnalyticsRequestOutcomeJob,
        heartbeat: {
            workerId: "analytics-worker",
            workerType: "analytics",
            intervalMs: ANALYTICS_WORKER_HEARTBEAT_INTERVAL_MS,
            freshnessMs: ANALYTICS_WORKER_HEARTBEAT_FRESHNESS_MS,
        },
    });

    return analyticsWorker;
}

export async function startAnalyticsWorker(): Promise<void> {
    await getAnalyticsWorker().start();
}

export async function processAnalyticsRequestOutcomeJob(
    job: AnalyticsRequestOutcomeJob,
    context: SafeWorkerJobContext,
    _signal?: AbortSignal,
    dependencies: AnalyticsWorkerDependencies =
        defaultAnalyticsWorkerDependencies,
): Promise<AnalyticsJobProcessingResult> {
    const scope = {
        orgId: job.orgId,
        requestId: job.requestId,
        jobType: job.jobType,
    } as const;
    const acquired = await dependencies.repository.acquireJobProcessing({
        ...scope,
        processingStartedAt: dependencies.now(),
    });

    if (acquired === "COMPLETED") {
        return "SKIPPED_COMPLETED";
    }

    if (acquired === "PROCESSING") {
        return "SKIPPED_PROCESSING";
    }

    try {
        const requestOutcome =
            await dependencies.repository.findRequestOutcome(
                job.orgId,
                job.requestId,
            );

        if (
            requestOutcome === null
            || requestOutcome.status !== job.status
            || requestOutcome.policyAction !== job.policyAction
            || (
                job.jobType === "request.completed"
                && (
                    requestOutcome.providerId !== job.providerId
                    || requestOutcome.model !== job.model
                )
            )
        ) {
            throw new UnrecoverableError(
                "Authoritative request outcome is unavailable.",
            );
        }

        const occurredAt = new Date(job.occurredAt);
        const { date, start, end } = getUtcAnalyticsDay(occurredAt);
        const organisationValues =
            await dependencies.repository.aggregateDaily({
                orgId: job.orgId,
                start,
                end,
            });
        const userValues = await dependencies.repository.aggregateDaily({
            orgId: job.orgId,
            userId: job.userId,
            start,
            end,
        });

        await dependencies.repository.upsertDailyAggregate({
            orgId: job.orgId,
            date,
            scope: "ORGANISATION",
            values: organisationValues,
        });
        await dependencies.repository.upsertDailyAggregate({
            orgId: job.orgId,
            userId: job.userId,
            date,
            scope: "USER",
            values: userValues,
        });
        await dependencies.repository.completeJobProcessing({
            ...scope,
            completedAt: dependencies.now(),
        });

        logger.info(
            {
                event: "analytics.job.completed",
                jobType: job.jobType,
                orgId: job.orgId,
                requestId: job.requestId,
            },
            "Analytics job completed",
        );

        return "APPLIED";
    } catch (error: unknown) {
        await releaseProcessingClaim(scope, dependencies.repository);

        logger.warn(
            {
                attemptsMade: context.attemptsMade,
                errorCategory: error instanceof UnrecoverableError
                    ? "TERMINAL"
                    : "TRANSIENT",
                event: "analytics.job.processing_failed",
                jobType: job.jobType,
                orgId: job.orgId,
                requestId: job.requestId,
            },
            "Analytics job processing failed",
        );

        if (error instanceof UnrecoverableError) {
            throw error;
        }

        throw new Error("Analytics job processing failed.");
    }
}

export function getUtcAnalyticsDay(date: Date): {
    readonly date: string;
    readonly start: Date;
    readonly end: Date;
} {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();

    return {
        date: [
            year,
            String(month + 1).padStart(2, "0"),
            String(day).padStart(2, "0"),
        ].join("-"),
        start: new Date(Date.UTC(year, month, day)),
        end: new Date(Date.UTC(year, month, day + 1)),
    };
}

async function releaseProcessingClaim(
    scope: {
        readonly orgId: string;
        readonly requestId: string;
        readonly jobType: AnalyticsRequestOutcomeJob["jobType"];
    },
    repository: AnalyticsRepository,
): Promise<void> {
    try {
        await repository.releaseJobProcessing(scope);
    } catch {
        logger.error(
            {
                errorCode: "ANALYTICS_JOB_CLAIM_RELEASE_FAILED",
                event: "analytics.job.claim_release_failed",
                jobType: scope.jobType,
                orgId: scope.orgId,
                requestId: scope.requestId,
            },
            "Analytics job processing claim release failed",
        );
    }
}
