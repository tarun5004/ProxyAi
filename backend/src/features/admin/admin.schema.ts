import { z } from "zod";

import {
    REQUEST_COMPLETED_STATUSES,
    REQUEST_POLICY_ACTIONS,
} from "../../shared/async/job-contract.js";
import { PROVIDER_IDS } from "../providers/provider.types.js";
import { USER_ROLES, USER_STATUSES } from "../users/user.types.js";
import { RETENTION_MODES } from "../organisations/organisation.types.js";
import { ADMIN_PERIODS } from "./admin.types.js";

const listLimit = z.coerce.number().int().min(1).max(100).default(25);
const optionalCursor = z.string().min(1).max(600).optional();
const optionalDateTime = z.string().datetime({ offset: true }).optional();

export const adminSummaryQuerySchema = z.strictObject({
    period: z.enum(ADMIN_PERIODS).default("month"),
});

export const adminLogsQuerySchema = z.strictObject({
    limit: listLimit,
    cursor: optionalCursor,
    userId: z.string().uuid().optional(),
    provider: z.enum(PROVIDER_IDS).optional(),
    status: z.enum([...REQUEST_COMPLETED_STATUSES, "BLOCKED"]).optional(),
    policyAction: z.enum([...REQUEST_POLICY_ACTIONS, "BLOCK"]).optional(),
    dateFrom: optionalDateTime,
    dateTo: optionalDateTime,
}).superRefine((value, context) => {
    if (
        value.dateFrom !== undefined
        && value.dateTo !== undefined
        && new Date(value.dateFrom) > new Date(value.dateTo)
    ) {
        context.addIssue({
            code: "custom",
            path: ["dateTo"],
            message: "dateTo must not be earlier than dateFrom.",
        });
    }
});

export const adminBillingQuerySchema = z.strictObject({
    period: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/).optional(),
});

export const adminAlertsQuerySchema = z.strictObject({
    limit: listLimit,
    cursor: optionalCursor,
    status: z.enum(["OPEN", "RESOLVED"]).optional(),
    userId: z.string().uuid().optional(),
});

export const adminUsersQuerySchema = z.strictObject({
    limit: listLimit,
    cursor: optionalCursor,
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    teamId: z.string().uuid().optional(),
});

export const adminTeamsQuerySchema = z.strictObject({
    limit: listLimit,
    cursor: optionalCursor,
    isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

export const adminUserIdParamsSchema = z.strictObject({
    userId: z.string().uuid(),
});

export const adminAlertIdParamsSchema = z.strictObject({
    alertId: z.string().uuid(),
});

export const adminUserRoleBodySchema = z.strictObject({
    role: z.enum(USER_ROLES),
});

export const adminUserTeamBodySchema = z.strictObject({
    teamId: z.string().uuid().nullable(),
});

export const adminUserStatusBodySchema = z.strictObject({
    status: z.enum(["ACTIVE", "DISABLED"]),
});

export const adminEmptyBodySchema = z.strictObject({});

export const adminPolicyBodySchema = z.strictObject({
    maskThreshold: z.number().int().min(0).max(100).optional(),
    blockThreshold: z.number().int().min(0).max(100).optional(),
    monthlyTokenBudget: z.number().int().nonnegative().safe().optional(),
}).refine((value) => Object.keys(value).length > 0, {
    message: "At least one policy field is required.",
});

export const adminRetentionBodySchema = z.strictObject({
    mode: z.enum(RETENTION_MODES),
});

export const adminAlertStatusBodySchema = z.strictObject({
    resolved: z.boolean(),
});

export const adminAuditExportQuerySchema = z.strictObject({
    dateFrom: z.string().datetime({ offset: true }),
    dateTo: z.string().datetime({ offset: true }),
    action: z.string().trim().min(1).max(120).optional(),
}).superRefine((value, context) => {
    const from = new Date(value.dateFrom);
    const to = new Date(value.dateTo);

    if (to < from) {
        context.addIssue({
            code: "custom",
            path: ["dateTo"],
            message: "dateTo must not be earlier than dateFrom.",
        });
    }

    if (to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1_000) {
        context.addIssue({
            code: "custom",
            path: ["dateTo"],
            message: "Audit export range cannot exceed 90 days.",
        });
    }
});
