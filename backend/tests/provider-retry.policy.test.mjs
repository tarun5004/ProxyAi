import assert from "node:assert/strict";
import test from "node:test";

const {
    calculateRetryDelayMs,
    isProviderError,
    ProviderRetryAbortedError,
    retryProviderOperation,
    shouldRetryProviderError,
} = await import("../dist/features/providers/provider-retry.policy.js");

function createProviderError(overrides = {}) {
    return {
        isProviderError: true,
        category: "timeout",
        providerId: "groq",
        message: "Provider failed.",
        retryable: true,
        ...overrides,
    };
}

const noWaitOptions = {
    providerId: "groq",
    calculateJitterMs: () => 0,
    sleep: async () => undefined,
};

test("retry policy retries transient failures then succeeds", async () => {
    let attempts = 0;
    const delays = [];

    const result = await retryProviderOperation(
        async () => {
            attempts += 1;

            if (attempts < 3) {
                throw createProviderError();
            }

            return "ok";
        },
        {
            ...noWaitOptions,
            sleep: async (delayMs) => {
                delays.push(delayMs);
            },
        },
    );

    assert.equal(result, "ok");
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [500, 1_000]);
});

test("retry policy does not retry non-retryable provider errors", async () => {
    let attempts = 0;
    const authError = createProviderError({
        category: "authentication",
        retryable: false,
        statusCode: 401,
    });

    await assert.rejects(
        retryProviderOperation(
            async () => {
                attempts += 1;
                throw authError;
            },
            noWaitOptions,
        ),
        authError,
    );

    assert.equal(attempts, 1);
});

test("retry policy enforces max attempts", async () => {
    let attempts = 0;
    const providerError = createProviderError({
        category: "provider_error",
        statusCode: 500,
    });

    await assert.rejects(
        retryProviderOperation(
            async () => {
                attempts += 1;
                throw providerError;
            },
            noWaitOptions,
        ),
        providerError,
    );

    assert.equal(attempts, 3);
});

test("retry policy respects abort during backoff", async () => {
    const abortController = new AbortController();
    let attempts = 0;

    await assert.rejects(
        retryProviderOperation(
            async () => {
                attempts += 1;
                throw createProviderError();
            },
            {
                ...noWaitOptions,
                signal: abortController.signal,
                sleep: async () => {
                    abortController.abort();
                },
            },
        ),
        (error) => {
            assert.equal(error instanceof ProviderRetryAbortedError, true);
            assert.equal(error.isProviderError, true);
            assert.equal(error.category, "timeout");
            assert.equal(error.retryable, false);
            assert.equal(error.providerId, "groq");

            return true;
        },
    );

    assert.equal(attempts, 1);
});

test("retry classification permits only approved transient failures", () => {
    assert.equal(isProviderError(null), false);
    assert.equal(isProviderError({ isProviderError: false }), false);
    assert.equal(shouldRetryProviderError(createProviderError({ category: "rate_limit" })), true);
    assert.equal(shouldRetryProviderError(createProviderError({ category: "unavailable" })), true);
    assert.equal(shouldRetryProviderError(createProviderError({ category: "provider_error", statusCode: 502 })), true);
    assert.equal(shouldRetryProviderError(createProviderError({ category: "provider_error", statusCode: 501 })), false);
    assert.equal(shouldRetryProviderError(createProviderError({ category: "invalid_request" })), false);
    assert.equal(shouldRetryProviderError(createProviderError({ retryable: false })), false);
});

test("retry delay clamps unsafe jitter and rejects invalid policies", () => {
    const policy = {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 150,
        maxJitterMs: 20,
    };

    assert.equal(calculateRetryDelayMs(2, policy, () => 99), 170);
    assert.equal(calculateRetryDelayMs(1, policy, () => -5), 100);
    assert.equal(calculateRetryDelayMs(1, policy, () => Number.NaN), 100);
    assert.throws(
        () => calculateRetryDelayMs(1, { ...policy, maxAttempts: 0 }),
        /Invalid provider retry policy/,
    );
});

test("already-aborted retry fails before invoking the provider", async () => {
    const abortController = new AbortController();
    abortController.abort();
    let attempts = 0;

    await assert.rejects(
        retryProviderOperation(
            async () => {
                attempts += 1;
                return "unexpected";
            },
            {
                providerId: "groq",
                model: "test-model",
                signal: abortController.signal,
            },
        ),
        (error) => error instanceof ProviderRetryAbortedError
            && error.model === "test-model",
    );
    assert.equal(attempts, 0);
});
