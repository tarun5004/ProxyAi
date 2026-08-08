import assert from "node:assert/strict";
import test from "node:test";

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
