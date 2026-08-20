import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { RateLimitError } from "groq-sdk";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();

const [
    { FakeProviderAdapter },
    { GroqProviderAdapter },
    { ProviderCircuitBreaker },
    { completeWithOrderedFallback, streamWithOrderedFallback },
    { readProviderHealth, writeProviderHealth },
    { retryProviderOperation },
    { metricsRegistry },
] = await Promise.all([
    import("../dist/features/providers/fake-provider.adapter.js"),
    import("../dist/features/providers/groq-provider.adapter.js"),
    import("../dist/features/providers/provider-circuit-breaker.js"),
    import("../dist/features/providers/provider-fallback.js"),
    import("../dist/features/providers/provider-health.store.js"),
    import("../dist/features/providers/provider-retry.policy.js"),
    import("../dist/shared/observability/metrics.js"),
]);

beforeEach(() => {
    metricsRegistry.resetMetrics();
});

test("provider adapter records terminal success and normalized failure", async () => {
    const successfulAdapter = createGroqAdapter(() => completionResponse());
    const failingAdapter = createGroqAdapter(() => {
        throw new RateLimitError(429, {}, "raw sdk message", new Headers());
    });

    await successfulAdapter.complete(createRequest());
    await assert.rejects(failingAdapter.complete(createRequest()));

    assert.equal(await metricValue("proxiai_provider_requests_total", {
        provider: "groq",
        outcome: "succeeded",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_requests_total", {
        provider: "groq",
        outcome: "failed",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_errors_total", {
        provider: "groq",
        error_category: "rate_limit",
    }), 1);
    assert.equal(await metricValue(
        "proxiai_provider_request_duration_seconds",
        { provider: "groq", outcome: "succeeded" },
        "proxiai_provider_request_duration_seconds_count",
    ), 1);
});

test("retry metrics distinguish actual scheduling from exhaustion", async () => {
    const providerError = createProviderError("timeout");

    await assert.rejects(retryProviderOperation(
        async () => {
            throw providerError;
        },
        {
            providerId: "groq",
            policy: {
                maxAttempts: 2,
                baseDelayMs: 0,
                maxDelayMs: 0,
                maxJitterMs: 0,
            },
            sleep: async () => undefined,
        },
    ));

    assert.equal(await metricValue("proxiai_provider_retries_total", {
        provider: "groq",
        error_category: "timeout",
        outcome: "scheduled",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_retries_total", {
        provider: "groq",
        error_category: "timeout",
        outcome: "exhausted",
    }), 1);
});

test("ordered fallback records only secondary candidate activity", async () => {
    const primary = new FakeProviderAdapter({
        providerId: "groq",
        model: "primary-model",
        mode: "server_error",
    });
    const secondary = new FakeProviderAdapter({
        providerId: "groq",
        model: "secondary-model",
        completionText: "fallback succeeded",
    });

    await completeWithOrderedFallback(
        createFallbackRequest(),
        [
            { adapter: primary, model: "primary-model" },
            { adapter: secondary, model: "secondary-model" },
        ],
        noRetryOptions(),
    );

    assert.equal(await metricValue("proxiai_provider_fallbacks_total", {
        provider: "groq",
        outcome: "attempted",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_fallbacks_total", {
        provider: "groq",
        outcome: "succeeded",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_fallbacks_total", {
        provider: "groq",
        outcome: "failed",
    }), undefined);
});

test("circuit and provider health metrics remain bounded one-hot states", async () => {
    const clock = { now: 1_000 };
    const breaker = new ProviderCircuitBreaker({
        policy: {
            failureThreshold: 1,
            cooldownMs: 1_000,
            halfOpenMaxTrials: 1,
        },
        now: () => clock.now,
    });

    await assert.rejects(breaker.execute("groq", async () => {
        throw createProviderError("unavailable");
    }));
    clock.now = 2_000;
    await breaker.execute("groq", async () => "healthy");

    const redisClient = createRedisClient();
    await writeProviderHealth("groq", {
        state: "UNHEALTHY",
        checkedAt: "2026-08-21T12:00:00.000Z",
    }, redisClient);
    await readProviderHealth("groq", createRedisClient(null));

    assert.equal(await metricValue("proxiai_provider_circuit_state", {
        provider: "groq",
        state: "CLOSED",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_circuit_state", {
        provider: "groq",
        state: "OPEN",
    }), 0);
    assert.equal(await metricValue("proxiai_provider_circuit_transitions_total", {
        provider: "groq",
        from_state: "CLOSED",
        to_state: "OPEN",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_circuit_transitions_total", {
        provider: "groq",
        from_state: "HALF_OPEN",
        to_state: "CLOSED",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_health_state", {
        provider: "groq",
        state: "UNKNOWN",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_health_state", {
        provider: "groq",
        state: "UNHEALTHY",
    }), 0);
});

test("mid-stream failure never switches provider and disconnect is not an error", async () => {
    const failingAdapter = createGroqAdapter(() => failingStream());
    const secondary = new FakeProviderAdapter({
        providerId: "third",
        model: "secondary-model",
        streamTokens: ["must not run"],
    });
    const iterator = streamWithOrderedFallback(
        createFallbackRequest(),
        [
            { adapter: failingAdapter, model: "openai/gpt-oss-20b" },
            { adapter: secondary, model: "secondary-model" },
        ],
        noRetryOptions(),
    )[Symbol.asyncIterator]();

    assert.deepEqual(await iterator.next(), {
        done: false,
        value: { type: "token", text: "partial" },
    });
    await assert.rejects(iterator.next());
    assert.equal(secondary.getCallCount(), 0);
    assert.equal(await metricValue("proxiai_provider_requests_total", {
        provider: "groq",
        outcome: "failed",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_errors_total", {
        provider: "groq",
        error_category: "provider_error",
    }), 1);

    metricsRegistry.resetMetrics();
    const streamingAdapter = createGroqAdapter(() => successfulStream());
    const disconnectIterator = streamingAdapter
        .stream(createRequest())
        [Symbol.asyncIterator]();

    await disconnectIterator.next();
    await disconnectIterator.return();

    assert.equal(await metricValue("proxiai_provider_requests_total", {
        provider: "groq",
        outcome: "interrupted",
    }), 1);
    assert.equal(await metricValue("proxiai_provider_errors_total", {
        provider: "groq",
        error_category: "provider_error",
    }), undefined);
});

function createGroqAdapter(create) {
    const nowValues = [100, 125, 150];

    return new GroqProviderAdapter({
        apiKey: "gsk_test_value",
        model: "openai/gpt-oss-20b",
        requestTimeoutMs: 30_000,
        client: {
            chat: {
                completions: {
                    create: async () => create(),
                },
            },
        },
        now: () => nowValues.shift() ?? 150,
    });
}

function createRequest() {
    return {
        requestId: "req_provider_metrics",
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: "safe test input" }],
        maxOutputTokens: 32,
    };
}

function createFallbackRequest() {
    const { providerId: _providerId, model: _model, ...request } = createRequest();
    return request;
}

function completionResponse() {
    return {
        model: "openai/gpt-oss-20b",
        choices: [{
            finish_reason: "stop",
            message: { content: "ok" },
        }],
    };
}

async function* failingStream() {
    yield {
        choices: [{ finish_reason: null, delta: { content: "partial" } }],
    };
    yield {
        choices: [],
        x_groq: { error: "sensitive provider diagnostic" },
    };
}

async function* successfulStream() {
    yield {
        choices: [{ finish_reason: null, delta: { content: "partial" } }],
    };
    yield {
        choices: [{ finish_reason: "stop", delta: {} }],
    };
}

function createProviderError(category) {
    return {
        isProviderError: true,
        category,
        providerId: "groq",
        message: "Provider failed.",
        retryable: true,
        statusCode: category === "unavailable" ? 503 : undefined,
    };
}

function noRetryOptions() {
    return {
        retryPolicy: {
            maxAttempts: 1,
            baseDelayMs: 0,
            maxDelayMs: 0,
            maxJitterMs: 0,
        },
        sleep: async () => undefined,
    };
}

function createRedisClient(storedValue = "unused") {
    return {
        async get() {
            return storedValue;
        },
        async set() {
            return "OK";
        },
    };
}

async function metricValue(name, labels, metricName = name) {
    const metric = (await metricsRegistry.getMetricsAsJSON())
        .find((candidate) => candidate.name === name);
    const sample = metric?.values.find((value) =>
        (value.metricName ?? name) === metricName
        && Object.entries(labels).every(
            ([label, expected]) => value.labels[label] === expected,
        ));

    return sample?.value;
}
