import { z } from "zod";

import {
    REQUEST_COMPLETED_STATUSES,
    REQUEST_POLICY_ACTIONS,
} from "../../shared/async/job-contract.js";
import { PROVIDER_IDS } from "../providers/provider.types.js";
import { USER_ROLES, USER_STATUSES } from "../users/user.types.js";
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
