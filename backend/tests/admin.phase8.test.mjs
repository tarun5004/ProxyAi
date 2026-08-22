import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const [
    { requirePermission },
    {
        getAdminBilling,
        getAdminSummary,
        listAdminAudit,
        listAdminLogs,
    },
    { adminAuditQuerySchema },
] = await Promise.all([
    import("../dist/features/auth/authorization.middleware.js"),
    import("../dist/features/admin/admin.service.js"),
    import("../dist/features/admin/admin.schema.js"),
]);

const trustedOrgId = randomUUID();
const foreignOrgId = randomUUID();

test("employee permission context is denied from admin routes", () => {
    const middleware = requirePermission("admin:view_logs");
    let error;

    middleware({
        auth: {
            orgId: trustedOrgId,
            userId: randomUUID(),
            role: "EMPLOYEE",
            permissions: ["chat:send", "chat:view_own"],
            sessionId: randomUUID(),
        },
    }, {}, (value) => {
        error = value;
    });

    assert.equal(error?.statusCode, 403);
    assert.equal(error?.code, "FORBIDDEN");
});

test("request-log service preserves trusted tenant scope and metadata-only output", async () => {
    let observedOrgId;
    const sensitiveSentinel = "RAW_PROMPT_SENTINEL";
    const page = await listAdminLogs({
        orgId: trustedOrgId,
        limit: 25,
    }, {
        async listLogs(input) {
            observedOrgId = input.orgId;
            return {
                items: [{
                    requestId: randomUUID(),
                    userId: randomUUID(),
                    status: "COMPLETED",
                    policyAction: "ALLOW",
                    providerId: "groq",
                    model: "openai/gpt-oss-20b",
                    inputTokens: 10,
                    outputTokens: 20,
                    totalTokens: 30,
                    createdAt: new Date("2026-08-21T00:00:00.000Z"),
                }],
                hasMore: false,
            };
        },
    });

    assert.equal(observedOrgId, trustedOrgId);
    assert.notEqual(observedOrgId, foreignOrgId);
    assert.equal(page.items.length, 1);
    assert.equal(JSON.stringify(page).includes(sensitiveSentinel), false);
    assert.equal("prompt" in page.items[0], false);
    assert.equal("response" in page.items[0], false);
    assert.equal("cost" in page.items[0], false);
});

test("audit browse preserves trusted tenant scope and emits an opaque cursor", async () => {
    const actorId = randomUUID();
    const auditId = randomUUID();
    const occurredAt = new Date("2026-08-21T10:00:00.000Z");
    let observedInput;
    const page = await listAdminAudit({
        orgId: trustedOrgId,
        dateFrom: new Date("2026-08-01T00:00:00.000Z"),
        dateTo: new Date("2026-08-21T23:59:59.000Z"),
        limit: 25,
        actorId,
        action: "user.role_changed",
    }, {
        async listForBrowse(input) {
            observedInput = input;
            return {
                items: [{
                    auditId,
                    actorId,
                    actorType: "USER",
                    actorRole: "ORG_ADMIN",
                    action: "user.role_changed",
                    outcome: "SUCCESS",
                    resourceType: "USER",
                    resourceId: randomUUID(),
                    metadata: { oldRole: "EMPLOYEE", newRole: "ORG_ADMIN" },
                    requestId: randomUUID(),
                    occurredAt,
                }],
                hasMore: true,
            };
        },
    });

    assert.equal(observedInput.orgId, trustedOrgId);
    assert.equal(observedInput.actorId, actorId);
    assert.equal(observedInput.action, "user.role_changed");
    assert.equal(page.items.length, 1);
    assert.equal(typeof page.nextCursor, "string");
    assert.equal(page.nextCursor.includes(trustedOrgId), false);
});

test("audit browse validation enforces allowlisted filters and a 90-day range", () => {
    const base = {
        dateFrom: "2026-05-24T00:00:00.000Z",
        dateTo: "2026-08-22T00:00:00.000Z",
        actorId: randomUUID(),
        action: "policy.block",
    };

    assert.equal(adminAuditQuerySchema.safeParse(base).success, true);
    assert.equal(adminAuditQuerySchema.safeParse({
        ...base,
        dateFrom: "2026-05-23T00:00:00.000Z",
    }).success, false);
    assert.equal(adminAuditQuerySchema.safeParse({
        ...base,
        action: "prompt.raw_exported",
    }).success, false);
    assert.equal(adminAuditQuerySchema.safeParse({
        ...base,
        actorId: "foreign-actor",
    }).success, false);
});

test("billing view keeps unknown usage explicit and omits unsupported cost", async () => {
    const billing = await getAdminBilling(
        trustedOrgId,
        "2026-08",
        {
            async findOrganisation(orgId) {
                assert.equal(orgId, trustedOrgId);
                return {
                    name: "Tenant",
                    plan: "FREE",
                    monthlyTokenBudget: 1_000,
                    retention: { mode: "METADATA_ONLY" },
                    policy: { maskThreshold: 20, blockThreshold: 60 },
                };
            },
            async aggregateBilling(input) {
                assert.equal(input.orgId, trustedOrgId);
                return {
                    usedTokens: 400,
                    sourceRequestCount: 3,
                    knownUsageCount: 2,
                    unresolvedUsageGroups: [{
                        providerId: "groq",
                        model: "openai/gpt-oss-20b",
                        requestCount: 1,
                    }],
                };
            },
            async aggregateAnalytics(input) {
                assert.equal(input.orgId, trustedOrgId);
                return analytics({
                    knownUsageRequestCount: 2,
                    unknownUsageRequestCount: 1,
                    inputTokens: 150,
                    outputTokens: 250,
                    totalTokens: 400,
                });
            },
        },
    );

    assert.equal(billing.budget.accountingComplete, false);
    assert.equal(billing.totals.unknownUsageRequestCount, 1);
    assert.equal(billing.totals.totalTokens, 400);
    assert.equal("cost" in billing, false);
    assert.equal("estimatedCostUsd" in billing.totals, false);
});

test("dashboard totals use authoritative repository data and trusted orgId", async () => {
    const repositoryCalls = [];
    const summary = await getAdminSummary(
        trustedOrgId,
        "month",
        new Date("2026-08-21T12:00:00.000Z"),
        {
            async findOrganisation(orgId) {
                repositoryCalls.push(orgId);
                return {
                    name: "Tenant",
                    plan: "PRO",
                    monthlyTokenBudget: 5_000,
                    retention: { mode: "METADATA_ONLY" },
                    policy: { maskThreshold: 20, blockThreshold: 60 },
                };
            },
            async aggregateAnalytics(input) {
                repositoryCalls.push(input.orgId);
                return analytics({ totalRequests: 7, successfulRequests: 4 });
            },
            async countOpenAlerts(orgId) {
                repositoryCalls.push(orgId);
                return 2;
            },
        },
        {
            async readBudget(orgId) {
                repositoryCalls.push(orgId);
                return {
                    monthlyBudgetTokens: 5_000,
                    usedTokens: 300,
                    remainingTokens: 4_700,
                    remainingPercent: 94,
                    exceeded: false,
                };
            },
            async readHealth() {
                return { state: "HEALTHY", checkedAt: "2026-08-21T11:59:00.000Z" };
            },
            providerIds() {
                return ["groq"];
            },
        },
    );

    assert.deepEqual(new Set(repositoryCalls), new Set([trustedOrgId]));
    assert.equal(summary.requests.total, 7);
    assert.equal(summary.requests.completed, 4);
    assert.equal(summary.alerts.open, 2);
    assert.equal(summary.providerHealth[0]?.state, "HEALTHY");
    assert.equal("latency" in summary, false);
    assert.equal("cache" in summary, false);
    assert.equal("fallback" in summary, false);
});

function analytics(overrides = {}) {
    return {
        totalRequests: 0,
        successfulRequests: 0,
        blockedRequests: 0,
        maskedRequests: 0,
        failedRequests: 0,
        interruptedRequests: 0,
        knownUsageRequestCount: 0,
        unknownUsageRequestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        providerModelRequestCounts: [],
        ...overrides,
    };
}
