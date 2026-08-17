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

export type RequestUsageDocument = HydratedDocument<RequestUsageRecord>;
export type BillingRollupDocument = HydratedDocument<BillingRollup>;
