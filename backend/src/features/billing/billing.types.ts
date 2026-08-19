import type { HydratedDocument } from "mongoose";

import type {
    ProviderId,
    TokenUsage,
} from "../providers/provider.types.js";

export interface RequestUsageRecord {
    requestId: string;
    orgId: string;
    userId: string;
    providerId: ProviderId;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    createdAt: Date;
}

export interface NewRequestUsageRecord {
    readonly requestId: string;
    readonly orgId: string;
    readonly userId: string;
    readonly providerId: ProviderId;
    readonly model: string;
    readonly usage?: Readonly<TokenUsage>;
}

export interface BillingRollup {
    orgId: string;
    period: string;
    usedTokens: number;
    sourceRequestCount: number;
    updatedAt: Date;
}

export interface PeriodUsageAggregate {
    readonly usedTokens: number;
    readonly sourceRequestCount: number;
    readonly knownUsageCount: number;
}

export const BILLING_JOB_LEDGER_STATES = [
    "PROCESSING",
    "COMPLETED",
] as const;
export type BillingJobLedgerState =
    (typeof BILLING_JOB_LEDGER_STATES)[number];

export const BILLING_JOB_OUTCOMES = [
    "APPLIED",
    "USAGE_UNAVAILABLE",
    "COST_UNAVAILABLE",
] as const;
export type BillingJobOutcome = (typeof BILLING_JOB_OUTCOMES)[number];

export interface BillingJobLedgerRecord {
    orgId: string;
    requestId: string;
    jobType: "request.completed";
    state: BillingJobLedgerState;
    processingStartedAt: Date;
    completedAt?: Date;
    outcome?: BillingJobOutcome;
}

export interface AuthoritativeRequestUsage {
    readonly createdAt: Date;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
}

export type RequestUsageDocument = HydratedDocument<RequestUsageRecord>;
export type BillingRollupDocument = HydratedDocument<BillingRollup>;
