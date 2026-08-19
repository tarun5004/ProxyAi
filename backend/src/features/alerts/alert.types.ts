import type { HydratedDocument } from "mongoose";

export const ANOMALY_ALERT_TYPE = "ANOMALY" as const;
export const ANOMALY_ALERT_SEVERITY = "HIGH" as const;
export const ANOMALY_ALERT_STATUSES = [
    "OPEN",
    "RESOLVED",
] as const;

export type AnomalyAlertStatus =
    (typeof ANOMALY_ALERT_STATUSES)[number];

export interface AnomalyAlertMetadata {
    observedTokens: number;
    baselineAverageTokens: number;
    baselineActiveDays: number;
    baselineWindowStart: string;
    baselineWindowEnd: string;
    thresholdMultiplier: 2;
}

export interface AnomalyAlert {
    alertId: string;
    orgId: string;
    userId: string;
    observedDay: string;
    type: typeof ANOMALY_ALERT_TYPE;
    severity: typeof ANOMALY_ALERT_SEVERITY;
    title: "Daily token usage anomaly";
    message: "Daily token usage exceeded the approved rolling baseline.";
    metadata: AnomalyAlertMetadata;
    status: AnomalyAlertStatus;
    resolvedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export type AnomalyAlertDocument = HydratedDocument<AnomalyAlert>;
