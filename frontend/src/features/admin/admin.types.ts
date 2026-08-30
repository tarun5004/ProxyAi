import { z } from "zod";

import { userPermissionSchema, userRoleSchema } from "@/features/auth/auth.types";

const providerIdSchema = z.enum(["groq", "gemini", "third"]);
export const ADMIN_AUDIT_ACTIONS = [
    "auth.login_succeeded",
    "auth.login_failed",
    "auth.login_operational_error",
    "auth.logout_succeeded",
    "auth.refresh_reuse_detected",
    "policy.allow",
    "policy.mask",
    "policy.block",
    "user.role_changed",
    "user.team_changed",
    "user.status_changed",
    "user.sessions_revoked",
    "organisation.policy_changed",
    "organisation.budget_changed",
    "organisation.retention_changed",
    "alert.resolved",
    "alert.reopened",
    "audit.exported",
] as const;
export const adminAuditActionSchema = z.enum(ADMIN_AUDIT_ACTIONS);
const providerModelCountSchema = z.object({
    providerId: providerIdSchema,
    model: z.string(),
    requestCount: z.number().int().nonnegative(),
});

export const adminSummarySchema = z.object({
    period: z.enum(["today", "7d", "30d", "month"]),
    range: z.object({ from: z.string(), to: z.string() }),
    organisation: z.object({
        name: z.string(),
        plan: z.enum(["FREE", "PRO", "ENTERPRISE"]),
        retentionMode: z.enum(["METADATA_ONLY", "ENCRYPTED_STORAGE"]),
        policy: z.object({
            maskThreshold: z.number().int(),
            blockThreshold: z.number().int(),
            maxOutputTokensPerRequest: z.number().int().min(1).max(4_096),
        }),
    }),
    requests: z.object({
        total: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
        masked: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        interrupted: z.number().int().nonnegative(),
    }),
    usage: z.object({
        knownRequestCount: z.number().int().nonnegative(),
        unknownRequestCount: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
    }),
    providerModels: z.array(providerModelCountSchema),
    budget: z.object({
        monthlyBudgetTokens: z.number().int().nonnegative(),
        usedTokens: z.number().int().nonnegative(),
        reservedTokens: z.number().int().nonnegative().optional(),
        budgetedTokens: z.number().int().nonnegative().optional(),
        remainingTokens: z.number().int().nonnegative(),
        remainingPercent: z.number().nonnegative(),
        exceeded: z.boolean(),
    }),
    alerts: z.object({ open: z.number().int().nonnegative() }),
    providerHealth: z.array(z.object({
        providerId: providerIdSchema,
        state: z.enum(["HEALTHY", "UNHEALTHY", "UNKNOWN"]),
        checkedAt: z.string().optional(),
    })),
});

export const adminBillingSchema = z.object({
    period: z.string(),
    budget: z.object({
        tokenLimit: z.number().int().nonnegative(),
        knownTokensUsed: z.number().int().nonnegative(),
        remainingKnownTokens: z.number().int().nonnegative(),
        exceededByKnownUsage: z.boolean(),
        accountingComplete: z.boolean(),
    }),
    totals: z.object({
        requestCount: z.number().int().nonnegative(),
        knownUsageRequestCount: z.number().int().nonnegative(),
        unknownUsageRequestCount: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
    }),
    providerModels: z.array(providerModelCountSchema),
    unresolvedUsage: z.array(z.object({
        providerId: providerIdSchema,
        model: z.string(),
        requestCount: z.number().int().positive(),
    })),
});

export const adminLogItemSchema = z.object({
    requestId: z.string().uuid(),
    userId: z.string().uuid(),
    status: z.enum(["COMPLETED", "BLOCKED", "FAILED", "INTERRUPTED"]),
    policyAction: z.enum(["ALLOW", "ALLOW_WITH_MASK", "BLOCK"]),
    providerId: providerIdSchema.optional(),
    model: z.string().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    createdAt: z.string(),
});

export const adminAuditItemSchema = z.object({
    auditId: z.string().uuid(),
    actorId: z.string().uuid().optional(),
    actorType: z.enum(["USER", "SYSTEM"]),
    actorRole: userRoleSchema.optional(),
    action: adminAuditActionSchema,
    outcome: z.enum(["SUCCESS", "FAILURE"]),
    resourceType: z.enum([
        "AUTH_SESSION",
        "POLICY_DECISION",
        "USER",
        "ORGANISATION",
        "ALERT",
        "AUDIT_EXPORT",
    ]),
    resourceId: z.string().optional(),
    metadata: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
    requestId: z.string(),
    occurredAt: z.string(),
});

export const adminUserItemSchema = z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
    role: userRoleSchema,
    permissions: z.array(userPermissionSchema),
    teamId: z.string().uuid().optional(),
    status: z.enum(["INVITED", "ACTIVE", "DISABLED"]),
    lastLoginAt: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export const adminTeamItemSchema = z.object({
    teamId: z.string().uuid(),
    name: z.string(),
    description: z.string().optional(),
    isActive: z.boolean(),
    createdBy: z.string().uuid(),
    memberCount: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export const adminAlertItemSchema = z.object({
    alertId: z.string().uuid(),
    userId: z.string().uuid(),
    observedDay: z.string(),
    type: z.literal("ANOMALY"),
    severity: z.literal("HIGH"),
    title: z.literal("Daily token usage anomaly"),
    message: z.literal("Daily token usage exceeded the approved rolling baseline."),
    metadata: z.object({
        observedTokens: z.number().int().nonnegative(),
        baselineAverageTokens: z.number().nonnegative(),
        baselineActiveDays: z.number().int().min(3).max(7),
        baselineWindowStart: z.string(),
        baselineWindowEnd: z.string(),
        thresholdMultiplier: z.literal(2),
    }),
    status: z.enum(["OPEN", "RESOLVED"]),
    resolvedAt: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type AdminSummary = z.infer<typeof adminSummarySchema>;
export type AdminBilling = z.infer<typeof adminBillingSchema>;
export type AdminLogItem = z.infer<typeof adminLogItemSchema>;
export type AdminAuditAction = z.infer<typeof adminAuditActionSchema>;
export type AdminAuditItem = z.infer<typeof adminAuditItemSchema>;
export type AdminUserItem = z.infer<typeof adminUserItemSchema>;
export type AdminTeamItem = z.infer<typeof adminTeamItemSchema>;
export type AdminAlertItem = z.infer<typeof adminAlertItemSchema>;
