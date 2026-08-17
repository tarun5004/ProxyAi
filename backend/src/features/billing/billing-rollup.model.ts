import mongoose from "mongoose";
import type { Model } from "mongoose";

import type { BillingRollup } from "./billing.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BILLING_PERIOD_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const { model, models, Schema } = mongoose;

const billingRollupSchema = new Schema<BillingRollup>(
    {
        orgId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        period: {
            type: String,
            immutable: true,
            match: BILLING_PERIOD_PATTERN,
            required: true,
        },
        usedTokens: {
            type: Number,
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
            required: true,
            validate: {
                validator: Number.isSafeInteger,
                message: "usedTokens must be a non-negative safe integer.",
            },
        },
        sourceRequestCount: {
            type: Number,
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
            required: true,
            validate: {
                validator: Number.isSafeInteger,
                message: "sourceRequestCount must be a non-negative safe integer.",
            },
        },
    },
    {
        collection: "billing_rollups",
        strict: "throw",
        timestamps: {
            createdAt: false,
            updatedAt: true,
        },
    },
);

billingRollupSchema.index(
    {
        orgId: 1,
        period: 1,
    },
    {
        name: "uniq_billing_rollups_org_period",
        unique: true,
    },
);
billingRollupSchema.index(
    {
        orgId: 1,
        period: -1,
    },
    {
        name: "idx_billing_rollups_org_period",
    },
);

const existingBillingRollupModel = models.BillingRollup as
    | Model<BillingRollup>
    | undefined;

export const BillingRollupModel =
    existingBillingRollupModel
    ?? model<BillingRollup>("BillingRollup", billingRollupSchema);
