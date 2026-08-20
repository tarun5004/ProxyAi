import { z } from "zod";

import { createSuccessEnvelopeSchema } from "@/lib/api/api-envelope";
import { requestJson } from "@/lib/api/api-client";

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

export function listAdminLogs(accessToken: string, signal?: AbortSignal) {
    return requestJson({
        path: "/admin/logs?limit=25",
        accessToken,
        signal,
        schema: listEnvelope(adminLogItemSchema),
    });
}

export function listAdminAlerts(accessToken: string, signal?: AbortSignal) {
    return requestJson({
        path: "/admin/alerts?limit=25",
        accessToken,
        signal,
        schema: listEnvelope(adminAlertItemSchema),
    });
}

export function listAdminUsers(accessToken: string, signal?: AbortSignal) {
    return requestJson({
        path: "/admin/users?limit=100",
        accessToken,
        signal,
        schema: listEnvelope(adminUserItemSchema),
    });
}

export function listAdminTeams(accessToken: string, signal?: AbortSignal) {
    return requestJson({
        path: "/admin/teams?limit=100",
        accessToken,
        signal,
        schema: listEnvelope(adminTeamItemSchema),
    });
}
