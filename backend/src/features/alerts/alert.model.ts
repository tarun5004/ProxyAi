import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import type { Model } from "mongoose";

import {
    ANOMALY_ALERT_SEVERITY,
    ANOMALY_ALERT_STATUSES,
    ANOMALY_ALERT_TYPE,
    type AnomalyAlert,
    type AnomalyAlertMetadata,
} from "./alert.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const { model, models, Schema } = mongoose;

const nonNegativeSafeIntegerField = {
    type: Number,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    required: true,
    validate: {
        validator: Number.isSafeInteger,
        message: "Anomaly token values must be safe integers.",
    },
} as const;

const anomalyMetadataSchema = new Schema<AnomalyAlertMetadata>(
    {
        observedTokens: nonNegativeSafeIntegerField,
        baselineAverageTokens: {
            type: Number,
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
            required: true,
            validate: {
                validator: Number.isFinite,
                message: "Anomaly baseline average must be finite.",
            },
        },
        baselineActiveDays: {
            type: Number,
            min: 3,
            max: 7,
            required: true,
            validate: {
                validator: Number.isInteger,
                message: "Anomaly baseline days must be an integer.",
            },
        },
        baselineWindowStart: {
            type: String,
            match: UTC_DATE_PATTERN,
            required: true,
        },
        baselineWindowEnd: {
            type: String,
            match: UTC_DATE_PATTERN,
            required: true,
        },
        thresholdMultiplier: {
            type: Number,
            enum: [2],
            required: true,
        },
    },
    {
        _id: false,
        strict: "throw",
    },
);

const alertSchema = new Schema<AnomalyAlert>(
    {
        alertId: {
            type: String,
            default: () => randomUUID(),
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        orgId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        userId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        observedDay: {
            type: String,
            immutable: true,
            match: UTC_DATE_PATTERN,
            required: true,
        },
        type: {
            type: String,
            default: ANOMALY_ALERT_TYPE,
            enum: [ANOMALY_ALERT_TYPE],
            immutable: true,
            required: true,
        },
        severity: {
            type: String,
            default: ANOMALY_ALERT_SEVERITY,
            enum: [ANOMALY_ALERT_SEVERITY],
            required: true,
        },
        title: {
            type: String,
            enum: ["Daily token usage anomaly"],
            required: true,
        },
        message: {
            type: String,
            enum: [
                "Daily token usage exceeded the approved rolling baseline.",
            ],
            required: true,
        },
        metadata: {
            type: anomalyMetadataSchema,
            required: true,
        },
        status: {
            type: String,
            default: "OPEN",
            enum: ANOMALY_ALERT_STATUSES,
            required: true,
        },
        resolvedAt: {
            type: Date,
        },
    },
    {
        collection: "alerts",
        strict: "throw",
        timestamps: true,
    },
);

alertSchema.pre("validate", function validateAlertState() {
    if (this.status === "OPEN" && this.resolvedAt !== undefined) {
        this.invalidate("resolvedAt", "Open alerts cannot be resolved.");
    }

    if (this.status === "RESOLVED" && this.resolvedAt === undefined) {
        this.invalidate("resolvedAt", "Resolved alerts require resolvedAt.");
    }
});

alertSchema.index({ alertId: 1 }, {
    name: "uniq_alerts_alert_id",
    unique: true,
});
alertSchema.index({ orgId: 1, status: 1, createdAt: -1 }, {
    name: "idx_alerts_org_status_created_at",
});
alertSchema.index({ orgId: 1, type: 1, createdAt: -1 }, {
    name: "idx_alerts_org_type_created_at",
});
alertSchema.index({ orgId: 1, userId: 1, createdAt: -1 }, {
    name: "idx_alerts_org_user_created_at",
});
alertSchema.index(
    { orgId: 1, userId: 1, observedDay: 1, type: 1 },
    {
        name: "uniq_alerts_daily_anomaly",
        unique: true,
        partialFilterExpression: {
            type: ANOMALY_ALERT_TYPE,
        },
    },
);

const existingAlertModel = models.Alert as
    | Model<AnomalyAlert>
    | undefined;

export const AlertModel = existingAlertModel
    ?? model<AnomalyAlert>("Alert", alertSchema);
