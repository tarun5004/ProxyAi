import type { HydratedDocument } from "mongoose";

import type {
    AnalyticsRequestOutcomeJob,
    RequestOutcomePolicyAction,
    RequestOutcomeStatus,
} from "../../shared/async/job-contract.js";
import type { ProviderId } from "../providers/provider.types.js";

export const ENQUEUE_RECOVERY_QUEUE_NAMES = [
    "billing-queue",
    "analytics-queue",
] as const;
export const ENQUEUE_RECOVERY_STATES = [
    "PENDING",
    "ENQUEUED",
    "COMPLETED",
    "FAILED",
] as const;
export const ENQUEUE_RECOVERY_ERROR_CATEGORIES = [
    "ENQUEUE_UNAVAILABLE",
    "SOURCE_UNAVAILABLE",
    "TERMINAL_JOB_FAILURE",
] as const;

export type EnqueueRecoveryQueueName =
    (typeof ENQUEUE_RECOVERY_QUEUE_NAMES)[number];
export type EnqueueRecoveryState =
    (typeof ENQUEUE_RECOVERY_STATES)[number];
export type EnqueueRecoveryErrorCategory =
    (typeof ENQUEUE_RECOVERY_ERROR_CATEGORIES)[number];
export type EnqueueRecoveryJobType =
    AnalyticsRequestOutcomeJob["jobType"];

export interface EnqueueRecoveryRecord {
    orgId: string;
    requestId: string;
    queueName: EnqueueRecoveryQueueName;
    jobType: EnqueueRecoveryJobType;
    state: EnqueueRecoveryState;
    attemptCount: number;
    nextAttemptAt?: Date;
    lastAttemptAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
    errorCategory?: EnqueueRecoveryErrorCategory;
    createdAt: Date;
    updatedAt: Date;
}

export interface RecoveryRequestSource {
    readonly cursorId: string;
    readonly requestId: string;
    readonly orgId: string;
    readonly userId: string;
    readonly status: RequestOutcomeStatus;
    readonly policyAction: RequestOutcomePolicyAction;
    readonly providerId?: ProviderId;
    readonly model?: string;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
    readonly createdAt: Date;
}

export type EnqueueRecoveryDocument =
    HydratedDocument<EnqueueRecoveryRecord>;
