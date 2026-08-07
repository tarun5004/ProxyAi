import assert from "node:assert/strict";
import test from "node:test";

const { FakeProviderAdapter, FakeProviderError } = await import(
    "../dist/features/providers/fake-provider.adapter.js"
);

function createRequest(overrides = {}) {
    return {
        requestId: "req_fake_provider_test",
        providerId: "third",
        model: "fake-model",
        messages: [
            {
                role: "user",
                content: "Hello fake provider",
            },
        ],
        maxOutputTokens: 64,
        ...overrides,
    };
}

test("fake provider returns deterministic completion", async () => {
    const adapter = new FakeProviderAdapter();

    const result = await adapter.complete(createRequest());

    assert.equal(result.providerId, "third");
    assert.equal(result.model, "fake-model");
    assert.equal(result.outputText, "Fake provider response.");
    assert.equal(result.finishReason, "stop");
    assert.equal(result.estimatedCostUsd, 0);
    assert.equal(result.usage.totalTokens, 11);
});

test("fake provider streams token chunks and done chunk", async () => {
    const adapter = new FakeProviderAdapter({
        streamTokens: ["Hello ", "stream"],
    });
    const chunks = [];

    for await (const chunk of adapter.stream(createRequest())) {
        chunks.push(chunk);
    }

    assert.deepEqual(chunks, [
        {
            type: "token",
            text: "Hello ",
        },
        {
            type: "token",
            text: "stream",
        },
        {
            type: "done",
            finishReason: "stop",
            usage: {
                inputTokens: 5,
                outputTokens: 3,
                totalTokens: 8,
            },
            latencyMs: 25,
            estimatedCostUsd: 0,
        },
    ]);
});

test("fake provider exposes normalized immediate failure modes", async () => {
    const expectedFailures = [
        ["timeout", "timeout", undefined],
        ["rate_limit", "rate_limit", 429],
        ["server_error", "provider_error", 500],
    ];

    for (const [mode, category, statusCode] of expectedFailures) {
        const adapter = new FakeProviderAdapter({ mode });

        await assert.rejects(
            adapter.complete(createRequest()),
            (error) => {
                assert.equal(error instanceof FakeProviderError, true);
                assert.equal(error.isProviderError, true);
                assert.equal(error.category, category);
                assert.equal(error.providerId, "third");
                assert.equal(error.retryable, true);
                assert.equal(error.statusCode, statusCode);

                return true;
            },
        );
    }
});

test("fake provider call counter tracks completion and stream calls", async () => {
    const adapter = new FakeProviderAdapter();

    await adapter.complete(createRequest());
    adapter.stream(createRequest());

    assert.equal(adapter.getCallCount(), 2);

    adapter.resetCallCount();

    assert.equal(adapter.getCallCount(), 0);
});

test("fake provider can fail after streaming starts", async () => {
    const adapter = new FakeProviderAdapter({
        mode: "mid_stream_failure",
        streamTokens: ["first", "second"],
    });
    const chunks = [];

    await assert.rejects(
        async () => {
            for await (const chunk of adapter.stream(createRequest())) {
                chunks.push(chunk);
            }
        },
        (error) => {
            assert.equal(error instanceof FakeProviderError, true);
            assert.equal(error.category, "provider_error");
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
}
);
