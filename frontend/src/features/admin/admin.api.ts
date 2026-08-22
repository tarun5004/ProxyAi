import { z } from "zod";

import { createSuccessEnvelopeSchema } from "@/lib/api/api-envelope";
import { requestJson } from "@/lib/api/api-client";
import { createApiPath } from "@/lib/api/api-path";
import {
    createCursorPagePath,
    type CursorPageOptions,
} from "@/lib/api/cursor-pagination";
import { ApiError } from "@/lib/errors/api-error";

import {
    adminAlertItemSchema,
    adminBillingSchema,
    adminLogItemSchema,
    adminSummarySchema,
    adminTeamItemSchema,
    adminUserItemSchema,
} from "./admin.types";

const listEnvelope = <T extends z.ZodType>(schema: T) =>
    createSuccessEnvelopeSchema(z.object({ items: z.array(schema) }));

export const ADMIN_PAGE_LIMIT = 25;

export function getAdminSummary(accessToken: string, signal?: AbortSignal) {
    return requestJson({
        path: "/admin/summary?period=month",
        accessToken,
        signal,
        schema: createSuccessEnvelopeSchema(adminSummarySchema),
    });
}

export function getAdminBilling(accessToken: string, signal?: AbortSignal) {
    return requestJson({
        path: "/admin/billing",
        accessToken,
        signal,
        schema: createSuccessEnvelopeSchema(adminBillingSchema),
    });
}

export function listAdminLogs(
    accessToken: string,
    options: CursorPageOptions = {},
) {
    return requestJson({
        path: createCursorPagePath("/admin/logs", ADMIN_PAGE_LIMIT, options.cursor),
        accessToken,
        signal: options.signal,
        schema: listEnvelope(adminLogItemSchema),
    });
}

export function listAdminAlerts(
    accessToken: string,
    options: CursorPageOptions = {},
) {
    return requestJson({
        path: createCursorPagePath("/admin/alerts", ADMIN_PAGE_LIMIT, options.cursor),
        accessToken,
        signal: options.signal,
        schema: listEnvelope(adminAlertItemSchema),
    });
}

export function listAdminUsers(
    accessToken: string,
    options: CursorPageOptions = {},
) {
    return requestJson({
        path: createCursorPagePath("/admin/users", ADMIN_PAGE_LIMIT, options.cursor),
        accessToken,
        signal: options.signal,
        schema: listEnvelope(adminUserItemSchema),
    });
}

export function listAdminTeams(
    accessToken: string,
    options: CursorPageOptions = {},
) {
    return requestJson({
        path: createCursorPagePath("/admin/teams", ADMIN_PAGE_LIMIT, options.cursor),
        accessToken,
        signal: options.signal,
        schema: listEnvelope(adminTeamItemSchema),
    });
}

const mutationEnvelope = createSuccessEnvelopeSchema(z.unknown());

export function updateAdminUserRole(accessToken: string, userId: string, role: "EMPLOYEE" | "TEAM_LEAD" | "ORG_ADMIN") {
    return requestJson({ path: `/admin/users/${userId}/role`, accessToken, method: "PATCH", body: { role }, schema: mutationEnvelope });
}

export function updateAdminUserTeam(accessToken: string, userId: string, teamId: string | null) {
    return requestJson({ path: `/admin/users/${userId}/team`, accessToken, method: "PATCH", body: { teamId }, schema: mutationEnvelope });
}

export function updateAdminUserStatus(accessToken: string, userId: string, status: "ACTIVE" | "DISABLED") {
    return requestJson({ path: `/admin/users/${userId}/status`, accessToken, method: "PATCH", body: { status }, schema: mutationEnvelope });
}

export function revokeAdminUserSessions(accessToken: string, userId: string) {
    return requestJson({ path: `/admin/users/${userId}/revoke-sessions`, accessToken, method: "POST", body: {}, schema: mutationEnvelope });
}

export function updateAdminPolicy(accessToken: string, input: { maskThreshold?: number; blockThreshold?: number; monthlyTokenBudget?: number }) {
    return requestJson({ path: "/admin/policy", accessToken, method: "PATCH", body: input, schema: mutationEnvelope });
}

export function updateAdminRetention(accessToken: string, mode: "METADATA_ONLY" | "ENCRYPTED_STORAGE") {
    return requestJson({ path: "/admin/retention", accessToken, method: "PATCH", body: { mode }, schema: mutationEnvelope });
}

export function updateAdminAlert(accessToken: string, alertId: string, resolved: boolean) {
    return requestJson({ path: `/admin/alerts/${alertId}`, accessToken, method: "PATCH", body: { resolved }, schema: mutationEnvelope });
}

export async function downloadAdminAudit(accessToken: string, dateFrom: string, dateTo: string): Promise<Blob> {
    const query = new URLSearchParams({ dateFrom, dateTo });
    const response = await fetch(createApiPath(`/admin/audit/export?${query}`), {
        headers: { authorization: `Bearer ${accessToken}` },
        credentials: "include",
        cache: "no-store",
    });
    if (!response.ok) throw await ApiError.fromResponse(response);
    return response.blob();
}
