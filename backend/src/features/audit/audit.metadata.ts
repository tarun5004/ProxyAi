import { z } from "zod";

import type {
    AuditAction,
    SafeAuditMetadata,
} from "./audit.types.js";

const reasonSchema = z.strictObject({
    reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
});
const emptySchema = z.strictObject({});
const policySchema = z.strictObject({
    riskScore: z.number().int().min(0).max(100),
    reasonCode: z.string().min(1).max(80),
    categoryCount: z.number().int().nonnegative().max(100),
});
const roleSchema = z.strictObject({
    oldRole: z.enum(["EMPLOYEE", "TEAM_LEAD", "ORG_ADMIN"]),
    newRole: z.enum(["EMPLOYEE", "TEAM_LEAD", "ORG_ADMIN"]),
});
const teamSchema = z.strictObject({
    oldTeamId: z.string().uuid().nullable(),
    newTeamId: z.string().uuid().nullable(),
});
const statusSchema = z.strictObject({
    oldStatus: z.enum(["INVITED", "ACTIVE", "DISABLED"]),
    newStatus: z.enum(["ACTIVE", "DISABLED"]),
    revokedSessionCount: z.number().int().nonnegative(),
});
const sessionsSchema = z.strictObject({
    revokedSessionCount: z.number().int().nonnegative(),
});
const policyChangeSchema = z.strictObject({
    oldMaskThreshold: z.number().int().min(0).max(100),
    newMaskThreshold: z.number().int().min(0).max(100),
    oldBlockThreshold: z.number().int().min(0).max(100),
    newBlockThreshold: z.number().int().min(0).max(100),
    oldMaxOutputTokensPerRequest: z.number().int().min(1).max(4_096),
    newMaxOutputTokensPerRequest: z.number().int().min(1).max(4_096),
});
const budgetSchema = z.strictObject({
    oldMonthlyTokenBudget: z.number().int().nonnegative(),
    newMonthlyTokenBudget: z.number().int().nonnegative(),
});
const retentionSchema = z.strictObject({
    oldMode: z.enum(["METADATA_ONLY", "ENCRYPTED_STORAGE"]),
    newMode: z.enum(["METADATA_ONLY", "ENCRYPTED_STORAGE"]),
});
const alertSchema = z.strictObject({
    oldStatus: z.enum(["OPEN", "RESOLVED"]),
    newStatus: z.enum(["OPEN", "RESOLVED"]),
});
const exportSchema = z.strictObject({
    dateFrom: z.string().datetime(),
    dateTo: z.string().datetime(),
    actorIdFilter: z.string().uuid().nullable(),
    actionFilter: z.string().max(120).nullable(),
    rowCount: z.number().int().nonnegative().max(10_000),
});

const schemaByAction: Readonly<Record<AuditAction, z.ZodType>> = {
    "auth.login_succeeded": emptySchema,
    "auth.login_failed": reasonSchema,
    "auth.login_operational_error": reasonSchema,
    "auth.logout_succeeded": reasonSchema,
    "auth.refresh_reuse_detected": reasonSchema,
    "policy.allow": policySchema,
    "policy.mask": policySchema,
    "policy.block": policySchema,
    "user.role_changed": roleSchema,
    "user.team_changed": teamSchema,
    "user.status_changed": statusSchema,
    "user.sessions_revoked": sessionsSchema,
    "organisation.policy_changed": policyChangeSchema,
    "organisation.budget_changed": budgetSchema,
    "organisation.retention_changed": retentionSchema,
    "alert.resolved": alertSchema,
    "alert.reopened": alertSchema,
    "audit.exported": exportSchema,
};

export function buildAuditMetadata(
    action: AuditAction,
    candidate: unknown,
): SafeAuditMetadata {
    const result = schemaByAction[action].safeParse(candidate);

    if (!result.success) {
        throw new Error("Invalid safe audit metadata.");
    }

    const serialized = JSON.stringify(result.data);

    if (Buffer.byteLength(serialized, "utf8") > 8 * 1024) {
        throw new Error("Safe audit metadata exceeds the approved limit.");
    }

    return Object.freeze(result.data as SafeAuditMetadata);
}
