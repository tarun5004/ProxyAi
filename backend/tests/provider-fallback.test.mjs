import assert from "node:assert/strict";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV ??= "test";
process.env.LOG_LEVEL ??= "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const {
    FakeProviderAdapter,
} = await import("../dist/features/providers/fake-provider.adapter.js");
const {
    AllProvidersUnavailableError,
    completeWithOrderedFallback,
    streamWithOrderedFallback,
} = await import("../dist/features/providers/provider-fallback.js");
const {
    ProviderCircuitBreaker,
} = await import("../dist/features/providers/provider-circuit-breaker.js");

const noRetryPolicy = {
    maxAttempts: 1,
    baseDelayMs: 0,
    maxDelayMs: 0,
    maxJitterMs: 0,
};

const noWaitOptions = {
    retryPolicy: noRetryPolicy,
    calculateJitterMs: () => 0,
    sleep: async () => undefined,
};

function createRequest() {
    return {
        requestId: "req_provider_fallback_test",
        messages: [
            {
                role: "user",
                content: "Hello provider chain",
            },
        ],
        maxOutputTokens: 64,
    };
}

function createCandidate(adapter, model) {
    return {
        adapter,
        model,
    };
}

function createProviderError(providerId = "groq") {
    return {
        isProviderError: true,
        category: "provider_error",
        providerId,
        message: "Provider failed.",
        retryable: true,
        statusCode: 500,
    };
}

test("ordered fallback uses secondary when primary fails", async () => {
    const primary = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
        mode: "server_error",
    });
    const secondary = new FakeProviderAdapter({
        providerId: "third",
        model: "fake-model",
        completionText: "secondary ok",
    });

    const response = await completeWithOrderedFallback(
        createRequest(),
        [
            createCandidate(primary, "groq-test-model"),
            createCandidate(secondary, "fake-model"),
        ],
        noWaitOptions,
    );

    assert.equal(response.result.providerId, "third");
    assert.equal(response.result.outputText, "secondary ok");
    assert.equal(primary.getCallCount(), 1);
    assert.equal(secondary.getCallCount(), 1);
    assert.deepEqual(
        response.metadata.attempts.map((attempt) => attempt.status),
        ["failed", "succeeded"],
    );
});

test("ordered fallback skips provider with open circuit", async () => {
    const circuitBreaker = new ProviderCircuitBreaker({
        policy: {
            failureThreshold: 1,
            cooldownMs: 10_000,
            halfOpenMaxTrials: 1,
        },
        now: () => 1_000,
    });
    const primary = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
    });
    const secondary = new FakeProviderAdapter({
        providerId: "third",
        model: "fake-model",
    });

    await assert.rejects(
        circuitBreaker.execute("groq", async () => {
            throw createProviderError();
        }),
    );

    const response = await completeWithOrderedFallback(
        createRequest(),
        [
            createCandidate(primary, "groq-test-model"),
            createCandidate(secondary, "fake-model"),
        ],
        {
            ...noWaitOptions,
            circuitBreaker,
        },
    );

    assert.equal(primary.getCallCount(), 0);
    assert.equal(secondary.getCallCount(), 1);
    assert.equal(response.metadata.attempts[0].status, "skipped_open_circuit");
});

test("ordered fallback returns normalized all-providers-unavailable error", async () => {
    const primary = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
        mode: "server_error",
    });
    const secondary = new FakeProviderAdapter({
        providerId: "third",
        model: "fake-model",
        mode: "server_error",
    });

    await assert.rejects(
        completeWithOrderedFallback(
            createRequest(),
            [
                createCandidate(primary, "groq-test-model"),
                createCandidate(secondary, "fake-model"),
            ],
            noWaitOptions,
        ),
        (error) => {
            assert.equal(error instanceof AllProvidersUnavailableError, true);
            assert.equal(error.isProviderError, true);
            assert.equal(error.category, "unavailable");
            assert.equal(error.statusCode, 503);
            assert.equal(error.providerId, "third");
            assert.equal(error.attempts.length, 2);

            return true;
        },
    );
});

test("ordered fallback does not switch provider after streamed token", async () => {
    const primary = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
        mode: "mid_stream_failure",
        streamTokens: ["first", "second"],
    });
    const secondary = new FakeProviderAdapter({
        providerId: "third",
        model: "fake-model",
        streamTokens: ["fallback"],
    });
    const chunks = [];

    await assert.rejects(
        async () => {
            for await (const chunk of streamWithOrderedFallback(
                createRequest(),
                [
                    createCandidate(primary, "groq-test-model"),
                    createCandidate(secondary, "fake-model"),
                ],
                noWaitOptions,
            )) {
                chunks.push(chunk);
            }
        },
        (error) => {
            assert.equal(error.isProviderError, true);
            assert.equal(error.providerId, "groq");
            assert.equal(error.statusCode, 500);

            return true;
        },
    );

    assert.deepEqual(chunks, [
        {
            type: "token",
            text: "first",
        },
    ]);
    assert.equal(secondary.getCallCount(), 0);
});

test("fallback rejects an empty candidate chain before provider execution", async () => {
    await assert.rejects(
        completeWithOrderedFallback(createRequest(), [], noWaitOptions),
        /requires at least one candidate/,
    );
    assert.throws(
        () => streamWithOrderedFallback(createRequest(), [], noWaitOptions),
        /requires at least one candidate/,
    );
});

test("stream fallback switches only when the primary fails before its first token", async () => {
    const events = [];
    const primary = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
        mode: "server_error",
    });
    const secondary = new FakeProviderAdapter({
        providerId: "third",
        model: "fake-model",
        streamTokens: ["safe"],
    });
    const chunks = [];

    for await (const chunk of streamWithOrderedFallback(
        createRequest(),
        [
            createCandidate(primary, "groq-test-model"),
            createCandidate(secondary, "fake-model"),
        ],
        {
            ...noWaitOptions,
            recordEvent: (event) => events.push(event),
        },
    )) {
        chunks.push(chunk);
    }

    assert.deepEqual(chunks.map(({ type }) => type), ["token", "done"]);
    assert.deepEqual(events.map(({ type }) => type), [
        "provider.fallback_candidate_failed",
        "provider.fallback_candidate_succeeded",
    ]);
    assert.equal(events[0].errorCategory, "provider_error");
    assert.equal(events[0].statusCode, 500);
});

test("fallback records non-provider failures without leaking an arbitrary error", async () => {
    const events = [];
    const adapter = {
        providerId: "third",
        async complete() {
            throw new Error("private sdk detail");
        },
        stream() {
            throw new Error("unused");
        },
        async checkHealth() {
            throw new Error("unused");
        },
        getCapabilities() {
            throw new Error("unused");
        },
    };

    await assert.rejects(
        completeWithOrderedFallback(
            createRequest(),
            [createCandidate(adapter, "plain-error-model")],
            { ...noWaitOptions, recordEvent: (event) => events.push(event) },
        ),
        (error) => error instanceof AllProvidersUnavailableError,
    );

    assert.equal(events[0].errorCategory, "provider_error");
    assert.equal("statusCode" in events[0], false);
    assert.equal(JSON.stringify(events).includes("private sdk detail"), false);
});

test("fallback reports every skipped OPEN candidate and never calls it", async () => {
    const circuitBreaker = new ProviderCircuitBreaker({
        policy: {
            failureThreshold: 1,
            cooldownMs: 10_000,
            halfOpenMaxTrials: 1,
        },
        now: () => 1_000,
    });
    const adapter = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
    });
    const events = [];

    await assert.rejects(
        circuitBreaker.execute("groq", async () => {
            throw createProviderError();
        }),
    );
    await assert.rejects(
        completeWithOrderedFallback(
            createRequest(),
            [
                createCandidate(adapter, "groq-test-model"),
                createCandidate(adapter, "groq-test-model"),
            ],
            {
                ...noWaitOptions,
                circuitBreaker,
                recordEvent: (event) => events.push(event),
            },
        ),
        (error) => error instanceof AllProvidersUnavailableError,
    );

    assert.equal(adapter.getCallCount(), 0);
    assert.deepEqual(events.map(({ type }) => type), [
        "provider.fallback_candidate_skipped",
        "provider.fallback_candidate_skipped",
        "provider.fallback_all_unavailable",
    ]);
});
