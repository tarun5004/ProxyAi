import mongoose from "mongoose";
import type { Model } from "mongoose";

import { REQUEST_COMPLETED_JOB_TYPE } from "../../shared/async/job-contract.js";
import {
    BILLING_JOB_LEDGER_STATES,
    BILLING_JOB_OUTCOMES,
    type BillingJobLedgerRecord,
} from "./billing.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { model, models, Schema } = mongoose;

const billingJobLedgerSchema = new Schema<BillingJobLedgerRecord>(
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
            enum: [REQUEST_COMPLETED_JOB_TYPE],
            immutable: true,
            required: true,
        },
        state: {
            type: String,
            enum: BILLING_JOB_LEDGER_STATES,
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
        outcome: {
            type: String,
            enum: BILLING_JOB_OUTCOMES,
        },
    },
    {
        collection: "billing_job_ledgers",
        strict: "throw",
        timestamps: false,
    },
);

billingJobLedgerSchema.pre("validate", function validateTerminalState() {
    if (this.state === "PROCESSING") {
        if (this.completedAt !== undefined || this.outcome !== undefined) {
            this.invalidate(
                "state",
                "Processing billing jobs cannot contain terminal metadata.",
            );
        }

        return;
    }

    if (this.completedAt === undefined || this.outcome === undefined) {
        this.invalidate(
            "state",
            "Completed billing jobs require terminal metadata.",
        );
    }
});

billingJobLedgerSchema.index(
    {
        orgId: 1,
        requestId: 1,
        jobType: 1,
    },
    {
        name: "uniq_billing_job_ledgers_scope",
        unique: true,
    },
);

const existingBillingJobLedgerModel = models.BillingJobLedger as
    | Model<BillingJobLedgerRecord>
    | undefined;

export const BillingJobLedgerModel =
    existingBillingJobLedgerModel
    ?? model<BillingJobLedgerRecord>(
        "BillingJobLedger",
        billingJobLedgerSchema,
    );
