import type { Request, Response } from "express";
import type { ZodIssue } from "zod";

import { AppError } from "../../shared/errors/app-error.js";
import { createSuccessResponse } from "../../shared/responses/api-response.js";
import { decodeAdminCursor } from "./admin.cursor.js";
import {
    adminAlertIdParamsSchema,
    adminAlertStatusBodySchema,
    adminAuditQuerySchema,
    adminAuditExportQuerySchema,
    adminEmptyBodySchema,
    adminAlertsQuerySchema,
    adminBillingQuerySchema,
    adminLogsQuerySchema,
    adminSummaryQuerySchema,
    adminTeamsQuerySchema,
    adminPolicyBodySchema,
    adminRetentionBodySchema,
    adminUserIdParamsSchema,
    adminUserRoleBodySchema,
    adminUserStatusBodySchema,
    adminUserTeamBodySchema,
    adminUsersQuerySchema,
} from "./admin.schema.js";
import {
    currentBillingPeriod,
    getAdminBilling,
    getAdminSummary,
    listAdminAudit,
    listAdminAlerts,
    listAdminLogs,
    listAdminTeams,
    listAdminUsers,
} from "./admin.service.js";
import {
    changeUserRole,
    changeUserStatus,
    changeUserTeam,
    revokeUserSessions,
    updateAlertResolution,
    updateOrganisationPolicy,
    updateOrganisationRetention,
    type AdminMutationContext,
} from "./admin.mutation.service.js";
import { exportOrganisationAuditCsv } from "../audit/audit.export.service.js";

export async function adminSummary(request: Request, response: Response) {
    const auth = requireAuth(request);
    const query = parseQuery(adminSummaryQuerySchema.safeParse(request.query));
    const data = await getAdminSummary(auth.orgId, query.period);
    send(response, request, data);
}

export async function adminBilling(request: Request, response: Response) {
    const auth = requireAuth(request);
    const query = parseQuery(adminBillingQuerySchema.safeParse(request.query));
    const data = await getAdminBilling(
        auth.orgId,
        query.period ?? currentBillingPeriod(),
    );
    send(response, request, data);
}

export async function adminLogs(request: Request, response: Response) {
    const auth = requireAuth(request);
    const query = parseQuery(adminLogsQuerySchema.safeParse(request.query));
    const page = await listAdminLogs({
        orgId: auth.orgId,
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: decodeAdminCursor(query.cursor) }),
        ...(query.userId === undefined ? {} : { userId: query.userId }),
        ...(query.provider === undefined ? {} : { providerId: query.provider }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.policyAction === undefined ? {} : { policyAction: query.policyAction }),
        ...(query.dateFrom === undefined ? {} : { dateFrom: new Date(query.dateFrom) }),
        ...(query.dateTo === undefined ? {} : { dateTo: new Date(query.dateTo) }),
    });
    sendPage(response, request, page);
}

export async function adminAudit(request: Request, response: Response) {
    const auth = requireAuth(request);
    const query = parseQuery(adminAuditQuerySchema.safeParse(request.query));
    const cursor = query.cursor === undefined
        ? undefined
        : decodeAdminCursor(query.cursor);
    const page = await listAdminAudit({
        orgId: auth.orgId,
        dateFrom: new Date(query.dateFrom),
        dateTo: new Date(query.dateTo),
        limit: query.limit,
        ...(cursor === undefined ? {} : {
            cursor: {
                occurredAt: cursor.createdAt,
                auditId: cursor.id,
            },
        }),
        ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
        ...(query.action === undefined ? {} : { action: query.action }),
    });
    sendPage(response, request, page);
}

export async function adminAlerts(request: Request, response: Response) {
    const auth = requireAuth(request);
    const query = parseQuery(adminAlertsQuerySchema.safeParse(request.query));
    const page = await listAdminAlerts({
        orgId: auth.orgId,
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: decodeAdminCursor(query.cursor) }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.userId === undefined ? {} : { userId: query.userId }),
    });
    sendPage(response, request, page);
}

export async function adminUsers(request: Request, response: Response) {
    const auth = requireAuth(request);
    const query = parseQuery(adminUsersQuerySchema.safeParse(request.query));
    const page = await listAdminUsers({
        orgId: auth.orgId,
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: decodeAdminCursor(query.cursor) }),
        ...(query.role === undefined ? {} : { role: query.role }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.teamId === undefined ? {} : { teamId: query.teamId }),
    });
    sendPage(response, request, page);
}

export async function adminTeams(request: Request, response: Response) {
    const auth = requireAuth(request);
    const query = parseQuery(adminTeamsQuerySchema.safeParse(request.query));
    const page = await listAdminTeams({
        orgId: auth.orgId,
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: decodeAdminCursor(query.cursor) }),
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    });
    sendPage(response, request, page);
}

export async function adminChangeUserRole(request: Request, response: Response) {
    const params = parseQuery(adminUserIdParamsSchema.safeParse(request.params));
    const body = parseQuery(adminUserRoleBodySchema.safeParse(request.body));
    send(response, request, await changeUserRole(mutationContext(request), params.userId, body.role));
}

export async function adminChangeUserTeam(request: Request, response: Response) {
    const params = parseQuery(adminUserIdParamsSchema.safeParse(request.params));
    const body = parseQuery(adminUserTeamBodySchema.safeParse(request.body));
    send(response, request, await changeUserTeam(mutationContext(request), params.userId, body.teamId));
}

export async function adminChangeUserStatus(request: Request, response: Response) {
    const params = parseQuery(adminUserIdParamsSchema.safeParse(request.params));
    const body = parseQuery(adminUserStatusBodySchema.safeParse(request.body));
    send(response, request, await changeUserStatus(mutationContext(request), params.userId, body.status));
}

export async function adminRevokeUserSessions(request: Request, response: Response) {
    const params = parseQuery(adminUserIdParamsSchema.safeParse(request.params));
    parseQuery(adminEmptyBodySchema.safeParse(request.body ?? {}));
    send(response, request, await revokeUserSessions(mutationContext(request), params.userId));
}

export async function adminUpdatePolicy(request: Request, response: Response) {
    const body = parseQuery(adminPolicyBodySchema.safeParse(request.body));
    send(response, request, await updateOrganisationPolicy(mutationContext(request), {
        ...(body.maskThreshold === undefined ? {} : { maskThreshold: body.maskThreshold }),
        ...(body.blockThreshold === undefined ? {} : { blockThreshold: body.blockThreshold }),
        ...(body.monthlyTokenBudget === undefined ? {} : { monthlyTokenBudget: body.monthlyTokenBudget }),
    }));
}

export async function adminUpdateRetention(request: Request, response: Response) {
    const body = parseQuery(adminRetentionBodySchema.safeParse(request.body));
    send(response, request, await updateOrganisationRetention(mutationContext(request), body.mode));
}

export async function adminUpdateAlert(request: Request, response: Response) {
    const params = parseQuery(adminAlertIdParamsSchema.safeParse(request.params));
    const body = parseQuery(adminAlertStatusBodySchema.safeParse(request.body));
    send(response, request, await updateAlertResolution(mutationContext(request), params.alertId, body.resolved));
}

export async function adminExportAudit(request: Request, response: Response) {
    const query = parseQuery(adminAuditExportQuerySchema.safeParse(request.query));
    const result = await exportOrganisationAuditCsv(mutationContext(request), {
        dateFrom: new Date(query.dateFrom),
        dateTo: new Date(query.dateTo),
        ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
        ...(query.action === undefined ? {} : { action: query.action }),
    });
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Request-ID", request.requestId);
    response.status(200).send(result.csv);
}

function requireAuth(request: Request) {
    if (request.auth === undefined) {
        throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
    }

    return request.auth;
}

function mutationContext(request: Request): AdminMutationContext {
    const auth = requireAuth(request);
    const userAgent = request.get("user-agent");

    return {
        orgId: auth.orgId,
        actorId: auth.userId,
        actorRole: auth.role,
        requestId: request.requestId,
        ipAddress: (request.ip ?? request.socket.remoteAddress ?? "unknown").slice(0, 64),
        ...(userAgent === undefined ? {} : { userAgent: userAgent.slice(0, 512) }),
    };
}

function parseQuery<T>(result: { success: true; data: T } | { success: false; error: { issues: ZodIssue[] } }): T {
    if (!result.success) {
        throw new AppError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed.",
            result.error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
            })),
        );
    }

    return result.data;
}

function send(response: Response, request: Request, data: unknown): void {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(createSuccessResponse(data, request.requestId));
}

function sendPage(
    response: Response,
    request: Request,
    page: { readonly items: readonly unknown[]; readonly nextCursor: string | null },
): void {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(createSuccessResponse(
        { items: page.items },
        request.requestId,
        page.nextCursor,
    ));
}
