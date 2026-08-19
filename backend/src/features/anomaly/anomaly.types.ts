import type { AnomalyAlertDocument } from "../alerts/alert.types.js";

export interface DailyUserTokenUsage {
    readonly date: string;
    readonly knownUsageRequestCount: number;
    readonly unknownUsageRequestCount: number;
    readonly totalTokens: number;
}

export interface AnomalyEvaluationMetadata {
    readonly observedTokens: number;
    readonly baselineAverageTokens: number;
    readonly baselineActiveDays: number;
    readonly baselineWindowStart: string;
    readonly baselineWindowEnd: string;
    readonly thresholdMultiplier: 2;
}

export interface UpsertDailyAnomalyAlertInput {
    readonly orgId: string;
    readonly userId: string;
    readonly observedDay: string;
    readonly metadata: AnomalyEvaluationMetadata;
}

export type DailyAnomalyAlertDocument = AnomalyAlertDocument;
