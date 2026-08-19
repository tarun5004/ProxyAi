import mongoose from "mongoose";
import type { Model } from "mongoose";

import { PROVIDER_IDS } from "../providers/provider.types.js";
import {
    ANALYTICS_AGGREGATE_SCOPES,
    type AnalyticsDailyAggregate,
    type ProviderModelRequestCount,
} from "./analytics.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const { model, models, Schema } = mongoose;

const safeCountField = {
    type: Number,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    required: true,
    validate: {
        validator: Number.isSafeInteger,
        message: "Analytics counts must be non-negative safe integers.",
    },
} as const;

const providerModelRequestCountSchema =
    new Schema<ProviderModelRequestCount>(
        {
            providerId: {
                type: String,
                enum: PROVIDER_IDS,
                required: true,
            },
            model: {
                type: String,
                minlength: 1,
                maxlength: 200,
                required: true,
                validate: {
                    validator: (value: string) => value.trim() === value,
                    message: "Analytics model must be trimmed.",
                },
            },
            requestCount: safeCountField,
        },
        {
            _id: false,
            strict: "throw",
        },
    );

const analyticsDailySchema = new Schema<AnalyticsDailyAggregate>(
    {
        orgId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        date: {
            type: String,
            immutable: true,
            match: UTC_DATE_PATTERN,
            required: true,
        },
        scope: {
            type: String,
            enum: ANALYTICS_AGGREGATE_SCOPES,
            immutable: true,
            required: true,
        },
        userId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
        },
        totalRequests: safeCountField,
        successfulRequests: safeCountField,
        blockedRequests: safeCountField,
        maskedRequests: safeCountField,
        failedRequests: safeCountField,
        interruptedRequests: safeCountField,
        knownUsageRequestCount: safeCountField,
        unknownUsageRequestCount: safeCountField,
        inputTokens: safeCountField,
        outputTokens: safeCountField,
        totalTokens: safeCountField,
        providerModelRequestCounts: {
            type: [providerModelRequestCountSchema],
            default: () => [],
            required: true,
        },
    },
    {
        collection: "analytics_daily_aggregates",
        strict: "throw",
        timestamps: {
            createdAt: false,
            updatedAt: true,
        },
    },
);

analyticsDailySchema.pre("validate", function validateScope() {
    if (this.scope === "USER" && this.userId === undefined) {
        this.invalidate("userId", "User analytics require userId.");
    }

    if (this.scope === "ORGANISATION" && this.userId !== undefined) {
        this.invalidate(
            "userId",
            "Organisation analytics cannot contain userId.",
        );
    }
});

analyticsDailySchema.index(
    {
        orgId: 1,
        date: 1,
        scope: 1,
        userId: 1,
    },
    {
        name: "uniq_analytics_daily_scope",
        unique: true,
    },
);
analyticsDailySchema.index(
    {
        orgId: 1,
        date: -1,
    },
    {
        name: "idx_analytics_daily_org_date",
    },
);

const existingAnalyticsDailyModel = models.AnalyticsDailyAggregate as
    | Model<AnalyticsDailyAggregate>
    | undefined;

export const AnalyticsDailyAggregateModel =
    existingAnalyticsDailyModel
    ?? model<AnalyticsDailyAggregate>(
        "AnalyticsDailyAggregate",
        analyticsDailySchema,
    );
