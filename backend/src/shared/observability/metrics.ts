import {
    collectDefaultMetrics,
    Counter,
    Gauge,
    Histogram,
    Registry,
} from "prom-client";

import { ENABLED_PRODUCTION_PROVIDER_IDS } from "../../features/providers/provider.types.js";

export const HTTP_DURATION_BUCKETS_SECONDS = Object.freeze([
    0.005,
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1,
    2.5,
    5,
    10,
]);

export const CHAT_LLM_DURATION_BUCKETS_SECONDS = Object.freeze([
    0.05,
    0.1,
    0.25,
    0.5,
    1,
    2.5,
    5,
    10,
    20,
    30,
    60,
]);

export const QUEUE_DURATION_BUCKETS_SECONDS = Object.freeze([
    0.005,
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1,
    2.5,
    5,
    10,
    30,
    60,
]);

export const APPROVED_HTTP_ROUTES = Object.freeze([
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/auth/me",
    "/api/v1/conversations",
    "/api/v1/conversations/:conversationId",
    "/api/v1/conversations/:conversationId/messages",
    "/api/v1/chat/stream",
    "/api/v1/admin/summary",
    "/api/v1/admin/logs",
    "/api/v1/admin/audit",
    "/api/v1/admin/billing",
    "/api/v1/admin/alerts",
    "/api/v1/admin/users",
    "/api/v1/admin/teams",
    "/api/v1/admin/users/:userId/role",
    "/api/v1/admin/users/:userId/team",
    "/api/v1/admin/users/:userId/status",
    "/api/v1/admin/users/:userId/revoke-sessions",
    "/api/v1/admin/policy",
    "/api/v1/admin/retention",
    "/api/v1/admin/alerts/:alertId",
    "/api/v1/admin/audit/export",
    "/health/live",
    "/health/ready",
    "unmatched",
] as const);

export const APPROVED_HTTP_METHODS = Object.freeze([
    "GET",
    "POST",
    "PATCH",
    "OPTIONS",
    "OTHER",
] as const);

export const APPROVED_HTTP_STATUS_CLASSES = Object.freeze([
    "2xx",
    "3xx",
    "4xx",
    "5xx",
] as const);

export const APPROVED_METRIC_LABEL_VALUES = Object.freeze({
    auditOutcomes: Object.freeze(["success", "failure"] as const),
    chatOutcomes: Object.freeze([
        "COMPLETED",
        "FAILED",
        "INTERRUPTED",
        "BLOCKED",
    ] as const),
    circuitStates: Object.freeze(["CLOSED", "OPEN", "HALF_OPEN"] as const),
    dependencies: Object.freeze(["mongodb", "redis"] as const),
    fallbackOutcomes: Object.freeze([
        "attempted",
        "succeeded",
        "failed",
        "all_unavailable",
        "skipped_open_circuit",
    ] as const),
    healthStates: Object.freeze([
        "HEALTHY",
        "UNHEALTHY",
        "UNKNOWN",
    ] as const),
    idempotencyOperations: Object.freeze([
        "reserve",
        "mark_completed",
        "release_before_execution",
    ] as const),
    idempotencyOutcomes: Object.freeze([
        "reserved",
        "processing_duplicate",
        "completed_duplicate",
        "fingerprint_mismatch",
        "unavailable",
        "completed",
        "released",
        "release_refused_after_provider_start",
    ] as const),
    piiCategories: Object.freeze([
        "CONTACT_INFO",
        "FINANCIAL",
        "GOVERNMENT_ID",
        "CREDENTIAL",
        "INTERNAL_SECRET",
        "BUSINESS_CONFIDENTIAL",
    ] as const),
    policyActions: Object.freeze([
        "ALLOW",
        "ALLOW_WITH_MASK",
        "BLOCK",
    ] as const),
    policyReasons: Object.freeze([
        "risk_below_mask_threshold",
        "mask_threshold_reached",
        "budget_exceeded",
        "high_risk_pii",
    ] as const),
    providerErrorCategories: Object.freeze([
        "timeout",
        "rate_limit",
        "authentication",
        "invalid_request",
        "unavailable",
        "provider_error",
    ] as const),
    providerOutcomes: Object.freeze([
        "succeeded",
        "failed",
        "interrupted",
    ] as const),
    providers: ENABLED_PRODUCTION_PROVIDER_IDS,
    queueDepthStates: Object.freeze([
        "waiting",
        "active",
        "delayed",
        "failed",
    ] as const),
    queueDurationOutcomes: Object.freeze([
        "completed",
        "retryable_failure",
        "terminal_failure",
        "invalid_payload",
    ] as const),
    queueOutcomes: Object.freeze([
        "enqueued",
        "completed",
        "retried",
        "failed",
        "invalid_payload",
    ] as const),
    queues: Object.freeze([
        "billing-queue",
        "analytics-queue",
        "anomaly-queue",
        "health-check-queue",
        "enqueue-recovery-queue",
    ] as const),
    retryOutcomes: Object.freeze(["scheduled", "exhausted"] as const),
    workers: Object.freeze([
        "billing",
        "analytics",
        "anomaly",
        "provider_health",
        "enqueue_recovery",
    ] as const),
});

export type ApprovedHttpRoute = (typeof APPROVED_HTTP_ROUTES)[number];
export type ApprovedHttpMethod = (typeof APPROVED_HTTP_METHODS)[number];
export type ApprovedHttpStatusClass =
    (typeof APPROVED_HTTP_STATUS_CLASSES)[number];

type MetricsStore = ReturnType<typeof createMetricsStore>;

const metricsGlobal = globalThis as typeof globalThis & {
    __proxiaiMetricsStoreV1?: MetricsStore;
};

export const metricsStore = metricsGlobal.__proxiaiMetricsStoreV1
    ?? createMetricsStore();

metricsGlobal.__proxiaiMetricsStoreV1 = metricsStore;

export const metricsRegistry = metricsStore.registry;
export const metrics = metricsStore.metrics;

export function normalizeHttpRoute(route: string): ApprovedHttpRoute {
    return includesValue(APPROVED_HTTP_ROUTES, route)
        ? route
        : "unmatched";
}

export function normalizeHttpMethod(method: string): ApprovedHttpMethod {
    const normalizedMethod = method.toUpperCase();

    return includesValue(APPROVED_HTTP_METHODS, normalizedMethod)
        ? normalizedMethod
        : "OTHER";
}

export function toHttpStatusClass(
    statusCode: number,
): ApprovedHttpStatusClass {
    if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599) {
        throw new Error("Unsupported HTTP status code for metrics.");
    }

    return `${Math.floor(statusCode / 100)}xx` as ApprovedHttpStatusClass;
}

export function requireApprovedMetricLabel<const Value extends string>(
    labelName: string,
    value: string,
    approvedValues: readonly Value[],
): Value {
    if (!includesValue(approvedValues, value)) {
        throw new Error(`Unsupported ${labelName} metric label.`);
    }

    return value;
}

function createMetricsStore() {
    const registry = new Registry();

    collectDefaultMetrics({
        prefix: "proxiai_",
        register: registry,
    });

    const applicationMetrics = Object.freeze({
        auditWritesTotal: createCounter(
            registry,
            "proxiai_audit_writes_total",
            "Durable AuditLog append outcomes.",
            ["outcome"],
        ),
        chatCompletionDurationSeconds: createHistogram(
            registry,
            "proxiai_chat_completion_duration_seconds",
            "Accepted non-blocked chat execution duration in seconds.",
            ["outcome"],
            CHAT_LLM_DURATION_BUCKETS_SECONDS,
        ),
        chatRequestsTotal: createCounter(
            registry,
            "proxiai_chat_requests_total",
            "Terminal chat request outcomes.",
            ["outcome", "policy_action"],
        ),
        chatTimeToFirstTokenSeconds: createHistogram(
            registry,
            "proxiai_chat_time_to_first_token_seconds",
            "Time until the first emitted provider token in seconds.",
            ["provider"],
            CHAT_LLM_DURATION_BUCKETS_SECONDS,
        ),
        dependencyReady: createGauge(
            registry,
            "proxiai_dependency_ready",
            "Current binary dependency readiness state.",
            ["dependency"],
        ),
        httpRequestDurationSeconds: createHistogram(
            registry,
            "proxiai_http_request_duration_seconds",
            "Handled HTTP request duration in seconds.",
            ["route", "method", "status_class"],
            HTTP_DURATION_BUCKETS_SECONDS,
        ),
        httpRequestsTotal: createCounter(
            registry,
            "proxiai_http_requests_total",
            "Handled HTTP request count.",
            ["route", "method", "status_class"],
        ),
        idempotencyOperationsTotal: createCounter(
            registry,
            "proxiai_idempotency_operations_total",
            "Idempotency reservation lifecycle outcomes.",
            ["operation", "outcome"],
        ),
        piiDetectionsTotal: createCounter(
            registry,
            "proxiai_pii_detections_total",
            "Final non-overlapping classified sensitive spans.",
            ["category"],
        ),
        policyDecisionsTotal: createCounter(
            registry,
            "proxiai_policy_decisions_total",
            "Evaluated policy decisions.",
            ["action", "reason"],
        ),
        providerCircuitState: createGauge(
            registry,
            "proxiai_provider_circuit_state",
            "Current one-hot provider circuit state.",
            ["provider", "state"],
        ),
        providerCircuitTransitionsTotal: createCounter(
            registry,
            "proxiai_provider_circuit_transitions_total",
            "Provider circuit state transitions.",
            ["provider", "from_state", "to_state"],
        ),
        providerErrorsTotal: createCounter(
            registry,
            "proxiai_provider_errors_total",
            "Normalized provider errors.",
            ["provider", "error_category"],
        ),
        providerFallbacksTotal: createCounter(
            registry,
            "proxiai_provider_fallbacks_total",
            "Ordered provider fallback outcomes.",
            ["provider", "outcome"],
        ),
        providerHealthState: createGauge(
            registry,
            "proxiai_provider_health_state",
            "Current one-hot provider health state.",
            ["provider", "state"],
        ),
        providerRequestDurationSeconds: createHistogram(
            registry,
            "proxiai_provider_request_duration_seconds",
            "Actual provider adapter execution duration in seconds.",
            ["provider", "outcome"],
            CHAT_LLM_DURATION_BUCKETS_SECONDS,
        ),
        providerRequestsTotal: createCounter(
            registry,
            "proxiai_provider_requests_total",
            "Actual provider adapter executions.",
            ["provider", "outcome"],
        ),
        providerRetriesTotal: createCounter(
            registry,
            "proxiai_provider_retries_total",
            "Actual provider retry scheduling and exhaustion outcomes.",
            ["provider", "error_category", "outcome"],
        ),
        queueDepth: createGauge(
            registry,
            "proxiai_queue_depth",
            "Current BullMQ queue depth by bounded state.",
            ["queue", "state"],
        ),
        queueJobDurationSeconds: createHistogram(
            registry,
            "proxiai_queue_job_duration_seconds",
            "BullMQ worker processing attempt duration in seconds.",
            ["queue", "outcome"],
            QUEUE_DURATION_BUCKETS_SECONDS,
        ),
        queueJobsTotal: createCounter(
            registry,
            "proxiai_queue_jobs_total",
            "BullMQ queue job outcomes.",
            ["queue", "outcome"],
        ),
        workerHealthy: createGauge(
            registry,
            "proxiai_worker_healthy",
            "Current managed worker health state.",
            ["worker"],
        ),
        workerHeartbeatAgeSeconds: createGauge(
            registry,
            "proxiai_worker_heartbeat_age_seconds",
            "Age of the last successful worker heartbeat in seconds.",
            ["worker"],
        ),
        workerLastSuccessfulJobAgeSeconds: createGauge(
            registry,
            "proxiai_worker_last_successful_job_age_seconds",
            "Age of the last successful worker job in seconds.",
            ["worker"],
        ),
        workerRunning: createGauge(
            registry,
            "proxiai_worker_running",
            "Current managed worker lifecycle state.",
            ["worker"],
        ),
    });

    return Object.freeze({
        metrics: applicationMetrics,
        registry,
    });
}

function createCounter<const LabelName extends string>(
    registry: Registry,
    name: string,
    help: string,
    labelNames: readonly LabelName[],
): Counter<LabelName> {
    return new Counter({
        help,
        labelNames: [...labelNames],
        name,
        registers: [registry],
    });
}

function createGauge<const LabelName extends string>(
    registry: Registry,
    name: string,
    help: string,
    labelNames: readonly LabelName[],
): Gauge<LabelName> {
    return new Gauge({
        help,
        labelNames: [...labelNames],
        name,
        registers: [registry],
    });
}

function createHistogram<const LabelName extends string>(
    registry: Registry,
    name: string,
    help: string,
    labelNames: readonly LabelName[],
    buckets: readonly number[],
): Histogram<LabelName> {
    return new Histogram({
        buckets: [...buckets],
        help,
        labelNames: [...labelNames],
        name,
        registers: [registry],
    });
}

function includesValue<const Value extends string>(
    approvedValues: readonly Value[],
    value: string,
): value is Value {
    return approvedValues.some((approvedValue) => approvedValue === value);
}
