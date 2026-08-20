import type { Request, Response } from "express";
import type { ZodIssue } from "zod";

import { AppError } from "../../shared/errors/app-error.js";
import { createSuccessResponse } from "../../shared/responses/api-response.js";
import { decodeAdminCursor } from "./admin.cursor.js";
import {
    adminAlertsQuerySchema,
    adminBillingQuerySchema,
    adminLogsQuerySchema,
    adminSummaryQuerySchema,
    adminTeamsQuerySchema,
    adminUsersQuerySchema,
} from "./admin.schema.js";
import {
    currentBillingPeriod,
    getAdminBilling,
    getAdminSummary,
    listAdminAlerts,
    listAdminLogs,
    listAdminTeams,
    listAdminUsers,
} from "./admin.service.js";

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

function requireAuth(request: Request) {
    if (request.auth === undefined) {
        throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
    }

    return request.auth;
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
