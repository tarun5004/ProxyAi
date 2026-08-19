import type { HydratedDocument } from "mongoose";

import type { ProviderId } from "../providers/provider.types.js";

export const ANALYTICS_AGGREGATE_SCOPES = [
    "ORGANISATION",
    "USER",
] as const;
export type AnalyticsAggregateScope =
    (typeof ANALYTICS_AGGREGATE_SCOPES)[number];

export interface ProviderModelRequestCount {
    providerId: ProviderId;
    model: string;
    requestCount: number;
}

export interface AnalyticsDailyAggregate {
    orgId: string;
    date: string;
    scope: AnalyticsAggregateScope;
    userId?: string;
    totalRequests: number;
    successfulRequests: number;
    blockedRequests: number;
    maskedRequests: number;
    failedRequests: number;
    interruptedRequests: number;
    knownUsageRequestCount: number;
    unknownUsageRequestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    providerModelRequestCounts: ProviderModelRequestCount[];
    updatedAt: Date;
}

export const ANALYTICS_JOB_LEDGER_STATES = [
    "PROCESSING",
    "COMPLETED",
] as const;
export type AnalyticsJobLedgerState =
    (typeof ANALYTICS_JOB_LEDGER_STATES)[number];

export interface AnalyticsJobLedgerRecord {
    orgId: string;
    requestId: string;
    jobType: "request.completed" | "request.blocked";
    state: AnalyticsJobLedgerState;
    processingStartedAt: Date;
    completedAt?: Date;
}

export interface AnalyticsAggregateValues {
    readonly totalRequests: number;
    readonly successfulRequests: number;
    readonly blockedRequests: number;
    readonly maskedRequests: number;
    readonly failedRequests: number;
    readonly interruptedRequests: number;
    readonly knownUsageRequestCount: number;
    readonly unknownUsageRequestCount: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly providerModelRequestCounts:
        readonly Readonly<ProviderModelRequestCount>[];
}

export type AnalyticsDailyAggregateDocument =
    HydratedDocument<AnalyticsDailyAggregate>;
