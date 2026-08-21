import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import type { Model } from "mongoose";

import {
    AUDIT_ACTIONS,
    AUDIT_ACTOR_TYPES,
    AUDIT_OUTCOMES,
    AUDIT_RESOURCE_TYPES,
    type AuditLog,
} from "./audit.types.js";
import { buildAuditMetadata } from "./audit.metadata.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { model, models, Schema } = mongoose;

const auditLogSchema = new Schema<AuditLog>({
    auditId: {
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
    actorId: { type: String, immutable: true, match: UUID_V4_PATTERN },
    actorType: {
        type: String,
        immutable: true,
        enum: AUDIT_ACTOR_TYPES,
        required: true,
    },
    actorRole: {
        type: String,
        immutable: true,
        enum: ["EMPLOYEE", "TEAM_LEAD", "ORG_ADMIN"],
    },
    action: {
        type: String,
        immutable: true,
        enum: AUDIT_ACTIONS,
        required: true,
    },
    outcome: {
        type: String,
        immutable: true,
        enum: AUDIT_OUTCOMES,
        required: true,
    },
    resourceType: {
        type: String,
        immutable: true,
        enum: AUDIT_RESOURCE_TYPES,
        required: true,
    },
    resourceId: { type: String, immutable: true, maxlength: 120 },
    metadata: {
        type: Schema.Types.Mixed,
        immutable: true,
        required: true,
        validate: {
            validator(value: unknown): boolean {
                return Buffer.byteLength(JSON.stringify(value), "utf8") <= 8 * 1024;
            },
            message: "Audit metadata exceeds the approved limit.",
        },
    },
    ipAddress: { type: String, immutable: true, maxlength: 64 },
    userAgent: { type: String, immutable: true, maxlength: 512 },
    requestId: {
        type: String,
        immutable: true,
        minlength: 1,
        maxlength: 128,
        required: true,
    },
    occurredAt: {
        type: Date,
        default: () => new Date(),
        immutable: true,
        required: true,
    },
}, {
    collection: "audit_logs",
    minimize: false,
    strict: "throw",
    timestamps: false,
});

auditLogSchema.pre("validate", function validateAuditMetadata() {
    this.metadata = buildAuditMetadata(this.action, this.metadata);
});

auditLogSchema.pre("save", function rejectAuditDocumentRewrite() {
    if (!this.isNew) {
        throw new Error("AuditLog is append-only.");
    }
});

for (const operation of [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "findOneAndReplace",
    "replaceOne",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
] as const) {
    auditLogSchema.pre(operation, function rejectAuditMutation() {
        throw new Error("AuditLog is append-only.");
    });
}

auditLogSchema.pre("bulkWrite", function rejectAuditBulkMutation() {
    throw new Error("AuditLog is append-only.");
});

auditLogSchema.index({ auditId: 1 }, {
    name: "uniq_audit_logs_audit_id",
    unique: true,
});
auditLogSchema.index({ orgId: 1, occurredAt: -1, auditId: -1 }, {
    name: "idx_audit_logs_org_occurred_audit",
});
auditLogSchema.index({ orgId: 1, actorId: 1, occurredAt: -1 }, {
    name: "idx_audit_logs_org_actor_occurred",
});
auditLogSchema.index({ orgId: 1, action: 1, occurredAt: -1 }, {
    name: "idx_audit_logs_org_action_occurred",
});
auditLogSchema.index(
    { orgId: 1, resourceType: 1, resourceId: 1, occurredAt: -1 },
    { name: "idx_audit_logs_org_resource_occurred" },
);

const existingAuditLogModel = models.AuditLog as Model<AuditLog> | undefined;

export const AuditLogModel = existingAuditLogModel
    ?? model<AuditLog>("AuditLog", auditLogSchema);
