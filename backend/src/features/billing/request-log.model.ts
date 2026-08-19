import mongoose from "mongoose";
import type { Model } from "mongoose";

import {
    REQUEST_COMPLETED_STATUSES,
    REQUEST_POLICY_ACTIONS,
} from "../../shared/async/job-contract.js";
import { PROVIDER_IDS } from "../providers/provider.types.js";
import type { RequestUsageRecord } from "./billing.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { model, models, Schema } = mongoose;

const requestLogSchema = new Schema<RequestUsageRecord>(
    {
        requestId: {
            type: String,
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
        status: {
            type: String,
            enum: [...REQUEST_COMPLETED_STATUSES, "BLOCKED"],
            immutable: true,
            required: true,
        },
        policyAction: {
            type: String,
            enum: [...REQUEST_POLICY_ACTIONS, "BLOCK"],
            immutable: true,
            required: true,
        },
        providerId: {
            type: String,
            enum: PROVIDER_IDS,
            immutable: true,
        },
        model: {
            type: String,
            immutable: true,
            minlength: 1,
            maxlength: 200,
        },
        inputTokens: tokenField(),
        outputTokens: tokenField(),
        totalTokens: tokenField(),
    },
    {
        collection: "request_logs",
        strict: "throw",
        timestamps: {
            createdAt: true,
            updatedAt: false,
        },
    },
);

requestLogSchema.pre("validate", function validateUsageCompleteness() {
    const tokenValues = [
        this.inputTokens,
        this.outputTokens,
        this.totalTokens,
    ];
    const presentTokenValues = tokenValues.filter(
        (value) => value !== undefined,
    );

    if (presentTokenValues.length !== 0 && presentTokenValues.length !== 3) {
        this.invalidate(
            "totalTokens",
            "Token usage must be entirely known or entirely unavailable.",
        );
        return;
    }

    if (
        this.inputTokens !== undefined
        && this.outputTokens !== undefined
        && this.totalTokens !== undefined
        && this.totalTokens !== this.inputTokens + this.outputTokens
    ) {
        this.invalidate(
            "totalTokens",
            "totalTokens must equal inputTokens plus outputTokens.",
        );
    }
});

requestLogSchema.pre("validate", function validateOutcomeShape() {
    if (this.status === "BLOCKED") {
        if (this.policyAction !== "BLOCK") {
            this.invalidate(
                "policyAction",
                "Blocked requests require the BLOCK policy action.",
            );
        }

        if (
            this.providerId !== undefined
            || this.model !== undefined
            || this.inputTokens !== undefined
            || this.outputTokens !== undefined
            || this.totalTokens !== undefined
        ) {
            this.invalidate(
                "status",
                "Blocked requests cannot contain provider or usage metadata.",
            );
        }

        return;
    }

    if (this.policyAction === "BLOCK") {
        this.invalidate(
            "policyAction",
            "Provider outcomes cannot use the BLOCK policy action.",
        );
    }

    if (this.providerId === undefined) {
        this.invalidate(
            "providerId",
            "Provider outcomes require providerId.",
        );
    }

    if (this.model === undefined) {
        this.invalidate(
            "model",
            "Provider outcomes require model.",
        );
    }
});

requestLogSchema.pre("save", function preventDocumentUpdate() {
    if (!this.isNew) {
        throw new Error("RequestLog records are append-only.");
    }
});

for (const operation of [
    "deleteMany",
    "deleteOne",
    "findOneAndDelete",
    "findOneAndReplace",
    "findOneAndUpdate",
    "replaceOne",
    "updateMany",
    "updateOne",
] as const) {
    requestLogSchema.pre(operation, rejectRequestLogMutation);
}

requestLogSchema.index(
    {
        requestId: 1,
    },
    {
        name: "uniq_request_logs_request_id",
        unique: true,
    },
);
requestLogSchema.index(
    {
        orgId: 1,
        createdAt: -1,
    },
    {
        name: "idx_request_logs_org_created",
    },
);
requestLogSchema.index(
    {
        orgId: 1,
        userId: 1,
        createdAt: -1,
    },
    {
        name: "idx_request_logs_org_user_created",
    },
);

const existingRequestLogModel = models.RequestLog as
    | Model<RequestUsageRecord>
    | undefined;

export const RequestLogModel =
    existingRequestLogModel
    ?? model<RequestUsageRecord>("RequestLog", requestLogSchema);

function tokenField() {
    return {
        type: Number,
        immutable: true,
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        validate: {
            validator: Number.isSafeInteger,
            message: "Token usage must be a non-negative safe integer.",
        },
    } as const;
}

function rejectRequestLogMutation(): never {
    throw new Error("RequestLog records are append-only.");
}
