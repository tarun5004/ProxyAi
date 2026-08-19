import mongoose from "mongoose";
import type { Model } from "mongoose";

import {
    REQUEST_BLOCKED_JOB_TYPE,
    REQUEST_COMPLETED_JOB_TYPE,
} from "../../shared/async/job-contract.js";
import {
    ENQUEUE_RECOVERY_ERROR_CATEGORIES,
    ENQUEUE_RECOVERY_QUEUE_NAMES,
    ENQUEUE_RECOVERY_STATES,
    type EnqueueRecoveryRecord,
} from "./enqueue-recovery.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { model, models, Schema } = mongoose;

const enqueueRecoverySchema = new Schema<EnqueueRecoveryRecord>(
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
        queueName: {
            type: String,
            enum: ENQUEUE_RECOVERY_QUEUE_NAMES,
            immutable: true,
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
            enum: ENQUEUE_RECOVERY_STATES,
            required: true,
        },
        attemptCount: {
            type: Number,
            min: 0,
            max: 3,
            required: true,
            validate: {
                validator: Number.isSafeInteger,
                message: "Recovery attempts must be a safe integer.",
            },
        },
        nextAttemptAt: Date,
        lastAttemptAt: Date,
        completedAt: Date,
        failedAt: Date,
        errorCategory: {
            type: String,
            enum: ENQUEUE_RECOVERY_ERROR_CATEGORIES,
        },
    },
    {
        collection: "async_enqueue_recovery",
        strict: "throw",
        timestamps: true,
    },
);

enqueueRecoverySchema.pre("validate", function validateQueueJobPair() {
    if (
        this.queueName === "billing-queue"
        && this.jobType !== REQUEST_COMPLETED_JOB_TYPE
    ) {
        this.invalidate(
            "jobType",
            "Billing recovery supports request.completed only.",
        );
    }
});

enqueueRecoverySchema.pre("validate", function validateStateMetadata() {
    if (this.state === "COMPLETED") {
        if (this.completedAt === undefined) {
            this.invalidate(
                "completedAt",
                "Completed recovery requires completedAt.",
            );
        }

        return;
    }

    if (this.state === "FAILED") {
        if (
            this.failedAt === undefined
            || this.errorCategory === undefined
        ) {
            this.invalidate(
                "failedAt",
                "Failed recovery requires safe failure metadata.",
            );
        }

        return;
    }

    if (this.completedAt !== undefined || this.failedAt !== undefined) {
        this.invalidate(
            "state",
            "Active recovery cannot contain terminal timestamps.",
        );
    }
});

enqueueRecoverySchema.index(
    {
        orgId: 1,
        requestId: 1,
        queueName: 1,
        jobType: 1,
    },
    {
        name: "uniq_async_enqueue_recovery_scope",
        unique: true,
    },
);
enqueueRecoverySchema.index(
    {
        state: 1,
        nextAttemptAt: 1,
        orgId: 1,
    },
    {
        name: "idx_async_enqueue_recovery_due",
    },
);

const existingEnqueueRecoveryModel = models.AsyncEnqueueRecovery as
    | Model<EnqueueRecoveryRecord>
    | undefined;

export const EnqueueRecoveryModel =
    existingEnqueueRecoveryModel
    ?? model<EnqueueRecoveryRecord>(
        "AsyncEnqueueRecovery",
        enqueueRecoverySchema,
    );
