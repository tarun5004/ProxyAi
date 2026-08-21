import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test, { beforeEach } from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.LOG_LEVEL = "fatal";

const [
    { app },
    { appendAudit },
    { recordProviderExecution },
    { recordQueueEnqueued },
    metricsModule,
] = await Promise.all([
    import("../dist/app.js"),
    import("../dist/features/audit/audit.service.js"),
    import("../dist/features/providers/provider-metrics.js"),
    import("../dist/shared/async/bullmq.js"),
    import("../dist/shared/observability/metrics.js"),
]);

const {
    APPROVED_METRIC_LABEL_VALUES,
    metrics,
    metricsRegistry,
    requireApprovedMetricLabel,
} = metricsModule;

const repositoryRoot = resolve(import.meta.dirname, "../..");
const sensitiveSentinels = Object.freeze([
    "org-sensitive-4b84f283",
    "user-sensitive-998f937e",
    "sensitive.person@example.test",
    "conversation-sensitive-21f766aa",
    "message-sensitive-ce3f851f",
    "request-sensitive-079627e8",
    "trace-sensitive-f93cd731",
    "prompt-sensitive-b04ee35d",
    "response-sensitive-e93ddbdd",
    "pii-sensitive-4111111111111111",
    "secret-sensitive-gsk_not_a_real_key_123456",
]);
const prohibitedLabelNames = new Set([
    "orgId",
    "orgSlug",
    "userId",
    "email",
    "conversationId",
    "messageId",
    "requestId",
    "traceId",
    "sessionId",
    "prompt",
    "response",
]);

beforeEach(() => {
    metricsRegistry.resetMetrics();
});

test("metrics interactions leak no sensitive input and cannot bypass auth", async () => {
    const query = new URLSearchParams({
        orgId: sensitiveSentinels[0],
        email: sensitiveSentinels[2],
        prompt: sensitiveSentinels[7],
    });
    const metricsResponse = await requestPath(`/metrics?${query}`, {
        headers: {
            authorization: `Bearer ${sensitiveSentinels[10]}`,
            cookie: `proxiai_refresh=${sensitiveSentinels[6]}`,
        },
    });
    const metricsBody = await metricsResponse.text();

    assert.equal(metricsResponse.status, 200);
    assertNoSensitiveSentinels(metricsBody);

    const malformedResponse = await requestPath("/metrics", {
        body: JSON.stringify({
            prompt: sensitiveSentinels[7],
            response: sensitiveSentinels[8],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
    });
    assert.equal(malformedResponse.status, 404);
    assertNoSensitiveSentinels(await malformedResponse.text());

    const protectedResponse = await requestPath("/api/v1/admin/summary");
    assert.equal(protectedResponse.status, 401);

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    const finalMetrics = await metricsRegistry.metrics();
    assertNoSensitiveSentinels(finalMetrics);
    assert.equal(
        finalMetrics.includes('route="/metrics"'),
        false,
        "GET /metrics must be excluded from HTTP request metrics to prevent scrape feedback.",
    );
    assert.match(
        finalMetrics,
        /proxiai_http_requests_total\{method="GET",route="(?:unmatched|\/api\/v1\/admin\/summary)",status_class="4xx"\} 1/,
    );
});

test("route, queue, provider, and PII dimensions remain bounded", async () => {
    const routeSeries = new Set();

    for (let index = 0; index < 25; index += 1) {
        const conversationId = randomUUID();
        const response = await requestPath(
            `/api/v1/conversations/${conversationId}`,
        );
        assert.equal(response.status, 401);
    }

    const invalidLabel = sensitiveSentinels[2];
    recordQueueEnqueued(invalidLabel);
    recordProviderExecution(invalidLabel, "succeeded", 1);
    assert.throws(
        () => requireApprovedMetricLabel(
            "PII category",
            invalidLabel,
            APPROVED_METRIC_LABEL_VALUES.piiCategories,
        ),
        (error) => {
            assert.equal(error instanceof Error, true);
            assert.equal(error.message.includes(invalidLabel), false);
            return true;
        },
    );

    for (const instrument of Object.values(metrics)) {
        for (const labelName of instrument.labelNames) {
            assert.equal(
                prohibitedLabelNames.has(labelName),
                false,
                `Prohibited metric label declared: ${labelName}`,
            );
        }
    }

    const output = await metricsRegistry.metrics();
    assertNoSensitiveSentinels(output);
    for (const line of output.split("\n")) {
        if (line.startsWith("proxiai_http_requests_total{")) {
            const route = /route="([^"]+)"/.exec(line)?.[1];
            if (route !== undefined) {
                routeSeries.add(route);
            }
        }
    }

    assert.deepEqual(
        [...routeSeries],
        ["/api/v1/conversations/:conversationId"],
    );
    assert.deepEqual(APPROVED_METRIC_LABEL_VALUES.providers, ["groq"]);
    assert.deepEqual(APPROVED_METRIC_LABEL_VALUES.piiCategories, [
        "CONTACT_INFO",
        "FINANCIAL",
        "GOVERNMENT_ID",
        "CREDENTIAL",
        "INTERNAL_SECRET",
        "BUSINESS_CONFIDENTIAL",
    ]);
    assert.deepEqual(APPROVED_METRIC_LABEL_VALUES.queues, [
        "billing-queue",
        "analytics-queue",
        "anomaly-queue",
        "health-check-queue",
        "enqueue-recovery-queue",
    ]);
});

test("Grafana, alerts, and runbooks use only implemented safe metrics", async () => {
    const dashboardPath = resolve(
        repositoryRoot,
        "deploy/observability/grafana/proxiai-overview.json",
    );
    const alertsPath = resolve(
        repositoryRoot,
        "deploy/observability/prometheus/proxiai-alerts.yml",
    );
    const dashboardText = readFileSync(dashboardPath, "utf8");
    const alertsText = readFileSync(alertsPath, "utf8");
    const dashboard = JSON.parse(dashboardText);
    const registeredMetrics = new Set(
        (await metricsRegistry.getMetricsAsJSON()).map((metric) => metric.name),
    );
    const referencedMetrics = new Set([
        ...extractMetricNames(dashboardText),
        ...extractMetricNames(alertsText),
    ]);

    assert.equal(Array.isArray(dashboard.panels), true);
    for (const metricName of referencedMetrics) {
        assert.equal(
            registeredMetrics.has(normalizePrometheusSeries(metricName)),
            true,
            `Operational config references an unknown metric: ${metricName}`,
        );
    }
    assert.equal(
        referencedMetrics.has("proxiai_prompt_cache_requests_total"),
        false,
    );

    const runbooks = [...alertsText.matchAll(
        /runbook_url:\s*(docs\/runbooks\/[^\s]+)/g,
    )].map((match) => match[1]);
    assert.equal(runbooks.length > 0, true);
    assert.equal(
        new Set(runbooks).size,
        runbooks.length,
        "Each alert must reference its own incident runbook.",
    );
    for (const runbook of new Set(runbooks)) {
        const runbookPath = resolve(repositoryRoot, runbook);
        assert.equal(existsSync(runbookPath), true, `Missing runbook: ${runbook}`);
        const content = readFileSync(runbookPath, "utf8");
        assert.match(content, /soft-stop|deep-stop/);
    }

    assertNoSensitiveSentinels(`${dashboardText}\n${alertsText}`);
});

test("AuditLog append outcomes increment success and failure metrics", async () => {
    const auditInput = {
        orgId: randomUUID(),
        actorUserId: randomUUID(),
        action: "ADMIN_ROLE_UPDATED",
        resourceType: "USER",
        resourceId: randomUUID(),
        metadata: {},
    };

    await appendAudit(auditInput, undefined, {
        async append() {
            return {};
        },
        async listForExport() {
            return [];
        },
    });
    await assert.rejects(
        appendAudit(auditInput, undefined, {
            async append() {
                throw new Error(sensitiveSentinels[8]);
            },
            async listForExport() {
                return [];
            },
        }),
        (error) => error?.code === "AUDIT_UNAVAILABLE",
    );

    const output = await metricsRegistry.metrics();
    assertNoSensitiveSentinels(output);
    assert.match(
        output,
        /proxiai_audit_writes_total\{outcome="success"\} 1/,
    );
    assert.match(
        output,
        /proxiai_audit_writes_total\{outcome="failure"\} 1/,
    );
});

async function requestPath(path, init) {
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    try {
        return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    } finally {
        server.close();
        await once(server, "close");
    }
}

function assertNoSensitiveSentinels(value) {
    for (const sentinel of sensitiveSentinels) {
        assert.equal(value.includes(sentinel), false, `Leaked sentinel: ${sentinel}`);
    }
}

function extractMetricNames(value) {
    return value.match(/\bproxiai_[a-zA-Z0-9_]+\b/g) ?? [];
}

function normalizePrometheusSeries(metricName) {
    return metricName.replace(/_(bucket|count|sum|created)$/, "");
}
