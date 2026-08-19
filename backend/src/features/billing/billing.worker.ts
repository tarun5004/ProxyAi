import { UnrecoverableError } from "bullmq";

import {
    createManagedWorker,
    type ManagedWorker,
    type SafeWorkerJobContext,
} from "../../shared/async/bullmq.js";
import {
    parseRequestCompletedJob,
    type RequestCompletedJob,
} from "../../shared/async/job-contract.js";
import { logger } from "../../shared/lib/logger.js";
import {
    billingRepository,
    type BillingRepository,
} from "./billing.repository.js";
import { BILLING_QUEUE_NAME } from "./billing.queue.js";
import { reconcileAuthoritativeTokenRollup } from "./billing.service.js";
import type { BillingJobOutcome } from "./billing.types.js";

export type BillingJobProcessingResult =
    | BillingJobOutcome
    | "SKIPPED_COMPLETED"
    | "SKIPPED_PROCESSING";

export interface BillingWorkerDependencies {
    readonly repository: BillingRepository;
    readonly now: () => Date;
}

const defaultBillingWorkerDependencies: BillingWorkerDependencies = {
    repository: billingRepository,
    now: () => new Date(),
};

let billingWorker: ManagedWorker | undefined;

export function getBillingWorker(): ManagedWorker {
    billingWorker ??= createManagedWorker<
        RequestCompletedJob,
        BillingJobProcessingResult
    >({
        queueName: BILLING_QUEUE_NAME,
        parse: parseRequestCompletedJob,
        process: processRequestCompletedBillingJob,
    });

    return billingWorker;
}

export async function startBillingWorker(): Promise<void> {
    await getBillingWorker().start();
}

export async function processRequestCompletedBillingJob(
    job: RequestCompletedJob,
    context: SafeWorkerJobContext,
    _signal?: AbortSignal,
    dependencies: BillingWorkerDependencies = defaultBillingWorkerDependencies,
): Promise<BillingJobProcessingResult> {
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

    if (acquired === "PROCESSING" && context.attemptsMade === 0) {
        return "SKIPPED_PROCESSING";
    }

    try {
        const requestUsage = await dependencies.repository.findRequestUsage(
            job.orgId,
            job.requestId,
        );

        if (requestUsage === null) {
            throw new UnrecoverableError(
                "Authoritative request usage record is unavailable.",
            );
        }

        const usageKnown = requestUsage.inputTokens !== undefined
            && requestUsage.outputTokens !== undefined
            && requestUsage.totalTokens !== undefined;
        const outcome = usageKnown
            ? await reconcileAuthoritativeTokenRollup(
                job.orgId,
                requestUsage.createdAt,
                dependencies.repository,
            )
            : "USAGE_UNAVAILABLE";

        await dependencies.repository.completeJobProcessing({
            ...scope,
            completedAt: dependencies.now(),
            outcome,
        });

        logger.info(
            {
                event: "billing.job.completed",
                jobType: job.jobType,
                orgId: job.orgId,
                outcome,
                requestId: job.requestId,
            },
            "Billing job completed",
        );

        return outcome;
    } catch (error: unknown) {
        await releaseProcessingClaim(scope, dependencies.repository);

        logger.warn(
            {
                attemptsMade: context.attemptsMade,
                errorCategory: error instanceof UnrecoverableError
                    ? "TERMINAL"
                    : "TRANSIENT",
                event: "billing.job.processing_failed",
                jobType: job.jobType,
                orgId: job.orgId,
                requestId: job.requestId,
            },
            "Billing job processing failed",
        );

        if (error instanceof UnrecoverableError) {
            throw error;
        }

        throw new Error("Billing job processing failed.");
    }
}

async function releaseProcessingClaim(
    scope: {
        readonly orgId: string;
        readonly requestId: string;
        readonly jobType: "request.completed";
    },
    repository: BillingRepository,
): Promise<void> {
    try {
        await repository.releaseJobProcessing(scope);
    } catch {
        logger.error(
            {
                errorCode: "BILLING_JOB_CLAIM_RELEASE_FAILED",
                event: "billing.job.claim_release_failed",
                jobType: scope.jobType,
                orgId: scope.orgId,
                requestId: scope.requestId,
            },
            "Billing job processing claim release failed",
        );
    }
}
