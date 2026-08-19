import mongoose from "mongoose";
import type { Model } from "mongoose";

import {
    REQUEST_BLOCKED_JOB_TYPE,
    REQUEST_COMPLETED_JOB_TYPE,
} from "../../shared/async/job-contract.js";
import {
    ANALYTICS_JOB_LEDGER_STATES,
    type AnalyticsJobLedgerRecord,
} from "./analytics.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { model, models, Schema } = mongoose;

const analyticsJobLedgerSchema = new Schema<AnalyticsJobLedgerRecord>(
    {
        orgId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        requestId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        jobType: {
            type: String,
            enum: [REQUEST_COMPLETED_JOB_TYPE, REQUEST_BLOCKED_JOB_TYPE],
            immutable: true,
            required: true,
        },
        state: {
            type: String,
            enum: ANALYTICS_JOB_LEDGER_STATES,
            required: true,
        },
        processingStartedAt: {
            type: Date,
            immutable: true,
            required: true,
        },
        completedAt: {
            type: Date,
        },
    },
    {
        collection: "analytics_job_ledgers",
        strict: "throw",
        timestamps: false,
    },
);

analyticsJobLedgerSchema.pre("validate", function validateTerminalState() {
    if (this.state === "PROCESSING" && this.completedAt !== undefined) {
        this.invalidate(
            "state",
            "Processing analytics jobs cannot be completed.",
        );
    }

    if (this.state === "COMPLETED" && this.completedAt === undefined) {
        this.invalidate(
            "state",
            "Completed analytics jobs require completedAt.",
        );
    }
});

analyticsJobLedgerSchema.index(
    {
        orgId: 1,
        requestId: 1,
        jobType: 1,
    },
    {
        name: "uniq_analytics_job_ledgers_scope",
        unique: true,
    },
);

const existingAnalyticsJobLedgerModel = models.AnalyticsJobLedger as
    | Model<AnalyticsJobLedgerRecord>
    | undefined;

export const AnalyticsJobLedgerModel =
    existingAnalyticsJobLedgerModel
    ?? model<AnalyticsJobLedgerRecord>(
        "AnalyticsJobLedger",
        analyticsJobLedgerSchema,
    );
