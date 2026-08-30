import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import type { Model } from "mongoose";

import {
    DEFAULT_MAX_OUTPUT_TOKENS_PER_REQUEST,
    MAX_MAX_OUTPUT_TOKENS_PER_REQUEST,
    MIN_MAX_OUTPUT_TOKENS_PER_REQUEST,
    ORGANISATION_PLANS,
    ORGANISATION_STATUSES,
    RETENTION_MODES,
} from "./organisation.types.js";
import type {
    Organisation,
    OrganisationFeatureFlags,
    OrganisationPolicy,
    OrganisationRetention,
} from "./organisation.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const { model, models, Schema } = mongoose;

const retentionSchema = new Schema<OrganisationRetention>(
    {
        mode: {
            type: String,
            enum: RETENTION_MODES,
            default: "METADATA_ONLY",
            required: true,
        },
    },
    {
        _id: false,
        strict: "throw",
    },
);

const policySchema = new Schema<OrganisationPolicy>(
    {
        maskThreshold: {
            type: Number,
            min: 0,
            max: 100,
            required: true,
            validate: {
                validator: Number.isInteger,
                message: "maskThreshold must be an integer.",
            },
        },
        blockThreshold: {
            type: Number,
            min: 0,
            max: 100,
            required: true,
            validate: {
                validator: Number.isInteger,
                message: "blockThreshold must be an integer.",
            },
        },
        maxOutputTokensPerRequest: {
            type: Number,
            default: DEFAULT_MAX_OUTPUT_TOKENS_PER_REQUEST,
            min: MIN_MAX_OUTPUT_TOKENS_PER_REQUEST,
            max: MAX_MAX_OUTPUT_TOKENS_PER_REQUEST,
            required: true,
            validate: {
                validator: Number.isInteger,
                message: "maxOutputTokensPerRequest must be an integer.",
            },
        },
    },
    {
        _id: false,
        strict: "throw",
    },
);

policySchema.pre("validate", function validatePolicyThresholdOrder() {
    if (this.blockThreshold <= this.maskThreshold) {
        this.invalidate(
            "blockThreshold",
            "blockThreshold must be greater than maskThreshold.",
        );
    }
});

const featureFlagsSchema = new Schema<OrganisationFeatureFlags>(
    {
        autoRouting: {
            type: Boolean,
            default: false,
            required: true,
        },
        teamLeadView: {
            type: Boolean,
            default: false,
            required: true,
        },
        anomalyDetection: {
            type: Boolean,
            default: false,
            required: true,
        },
        auditExport: {
            type: Boolean,
            default: false,
            required: true,
        },
    },
    {
        _id: false,
        strict: "throw",
    },
);

const organisationSchema = new Schema<Organisation>(
    {
        orgId: {
            type: String,
            default: () => randomUUID(),
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        name: {
            type: String,
            trim: true,
            minlength: 1,
            maxlength: 120,
            required: true,
        },
        slug: {
            type: String,
            trim: true,
            minlength: 2,
            maxlength: 63,
            match: SLUG_PATTERN,
            immutable: true,
            required: true,
        },
        status: {
            type: String,
            enum: ORGANISATION_STATUSES,
            default: "SUSPENDED",
            required: true,
        },
        plan: {
            type: String,
            enum: ORGANISATION_PLANS,
            default: "FREE",
            required: true,
        },
        monthlyTokenBudget: {
            type: Number,
            default: 0,
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
            required: true,
            validate: {
                validator: Number.isSafeInteger,
                message: "monthlyTokenBudget must be a safe integer.",
            },
        },
        retention: {
            type: retentionSchema,
            default: () => ({}),
            required: true,
        },
        policy: {
            type: policySchema,
            required: true,
        },
        featureFlags: {
            type: featureFlagsSchema,
            default: () => ({}),
            required: true,
        },
    },
    {
        collection: "organisations",
        strict: "throw",
        timestamps: true,
    },
);

organisationSchema.index(
    {
        orgId: 1,
    },
    {
        name: "uniq_organisations_org_id",
        unique: true,
    },
);
organisationSchema.index(
    {
        slug: 1,
    },
    {
        name: "uniq_organisations_slug",
        unique: true,
    },
);
organisationSchema.index(
    {
        status: 1,
    },
    {
        name: "idx_organisations_status",
    },
);

const existingOrganisationModel = models.Organisation as
    | Model<Organisation>
    | undefined;

export const OrganisationModel =
    existingOrganisationModel
    ?? model<Organisation>("Organisation", organisationSchema);
