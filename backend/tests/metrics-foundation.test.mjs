import assert from "node:assert/strict";
import { once } from "node:events";
import test, { beforeEach } from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();

const [{ app }, metricsModule] = await Promise.all([
    import("../dist/app.js"),
    import("../dist/shared/observability/metrics.js"),
]);

const {
    APPROVED_METRIC_LABEL_VALUES,
    CHAT_LLM_DURATION_BUCKETS_SECONDS,
    HTTP_DURATION_BUCKETS_SECONDS,
    QUEUE_DURATION_BUCKETS_SECONDS,
    metrics,
    metricsRegistry,
    normalizeHttpMethod,
    normalizeHttpRoute,
    requireApprovedMetricLabel,
    toHttpStatusClass,
} = metricsModule;

beforeEach(() => {
    metricsRegistry.resetMetrics();
});

async function requestMetrics() {
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    try {
        return await fetch(`http://127.0.0.1:${address.port}/metrics`);
    } finally {
        server.close();
        await once(server, "close");
    }
}

test("metrics registry remains a singleton across module reloads", async () => {
    const reloadedModule = await import(
        `../dist/shared/observability/metrics.js?reload=${Date.now()}`
    );
    const metricNames = (await metricsRegistry.getMetricsAsJSON()).map(
        (metric) => metric.name,
    );

    assert.equal(reloadedModule.metricsRegistry, metricsRegistry);
    assert.equal(reloadedModule.metrics, metrics);
    assert.equal(new Set(metricNames).size, metricNames.length);
});

test("metric inventory and duration buckets match the bounded contract", async () => {
    const metricNames = new Set(
        (await metricsRegistry.getMetricsAsJSON()).map((metric) => metric.name),
    );

    assert.equal(metricNames.has("proxiai_http_requests_total"), true);
    assert.equal(metricNames.has("proxiai_chat_requests_total"), true);
    assert.equal(metricNames.has("proxiai_provider_requests_total"), true);
    assert.equal(metricNames.has("proxiai_queue_jobs_total"), true);
    assert.equal(metricNames.has("proxiai_audit_writes_total"), true);
    assert.equal(metricNames.has("proxiai_prompt_cache_requests_total"), false);
    assert.deepEqual(HTTP_DURATION_BUCKETS_SECONDS, [
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ]);
    assert.deepEqual(CHAT_LLM_DURATION_BUCKETS_SECONDS, [
        0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60,
    ]);
    assert.deepEqual(QUEUE_DURATION_BUCKETS_SECONDS, [
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
    ]);
});

test("metric label helpers bound values without reflecting rejected input", () => {
    const sensitiveSentinel = "tenant@example.test?orgId=secret";

    assert.equal(normalizeHttpRoute("/health/live"), "/health/live");
    assert.equal(normalizeHttpRoute(sensitiveSentinel), "unmatched");
    assert.equal(normalizeHttpMethod("post"), "POST");
    assert.equal(normalizeHttpMethod("TRACE"), "OTHER");
    assert.equal(toHttpStatusClass(204), "2xx");
    assert.throws(
        () => toHttpStatusClass(199),
        /Unsupported HTTP status code for metrics\./,
    );
    assert.throws(
        () => requireApprovedMetricLabel(
            "provider",
            sensitiveSentinel,
            APPROVED_METRIC_LABEL_VALUES.providers,
        ),
        (error) => {
            assert.equal(error instanceof Error, true);
            assert.equal(error.message.includes(sensitiveSentinel), false);
            return true;
        },
    );
});

test("GET /metrics returns Prometheus text without an API envelope", async () => {
    metrics.httpRequestsTotal.inc({
        method: "GET",
        route: "/health/live",
        status_class: "2xx",
    });
    metrics.httpRequestDurationSeconds.observe(
        {
            method: "GET",
            route: "/health/live",
            status_class: "2xx",
        },
        0.02,
    );

    const response = await requestMetrics();
    const body = await response.text();

    assert.equal(response.status, 200);
    const contentType = response.headers.get("content-type") ?? "";
    assert.equal(contentType.startsWith("text/plain"), true);
    assert.equal(contentType.includes("version=0.0.4"), true);
    assert.match(body, /# TYPE proxiai_http_requests_total counter/);
    const requestMetric = body.split("\n").find(
        (line) => line.startsWith("proxiai_http_requests_total{"),
    );
    const durationBucket = body.split("\n").find(
        (line) => line.startsWith(
            'proxiai_http_request_duration_seconds_bucket{le="0.025"',
        ),
    );
    assert.equal(requestMetric?.includes('route="/health/live"'), true);
    assert.equal(requestMetric?.includes('method="GET"'), true);
    assert.equal(requestMetric?.includes('status_class="2xx"'), true);
    assert.equal(requestMetric?.endsWith(" 1"), true);
    assert.equal(durationBucket?.includes('route="/health/live"'), true);
    assert.equal(durationBucket?.includes('method="GET"'), true);
    assert.equal(durationBucket?.includes('status_class="2xx"'), true);
    assert.equal(durationBucket?.endsWith(" 1"), true);
    assert.equal(body.includes('"success"'), false);
    assert.equal(body.includes("orgId"), false);
    assert.equal(body.includes("userId"), false);
});
