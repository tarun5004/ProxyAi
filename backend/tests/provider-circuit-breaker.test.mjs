import assert from "node:assert/strict";
import test from "node:test";

const {
    ProviderCircuitBreaker,
    ProviderCircuitOpenError,
} = await import(
    "../dist/features/providers/provider-circuit-breaker.js"
);

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

function createBreaker(nowRef = { value: 1_000 }) {
    return new ProviderCircuitBreaker({
        policy: {
            failureThreshold: 2,
            cooldownMs: 1_000,
            halfOpenMaxTrials: 1,
        },
        now: () => nowRef.value,
    });
}

test("circuit breaker moves CLOSED to OPEN after threshold failures", async () => {
    const breaker = createBreaker();
    const providerError = createProviderError();

    for (let index = 0; index < 2; index += 1) {
        await assert.rejects(
            breaker.execute("groq", async () => {
                throw providerError;
            }),
            providerError,
        );
    }

    assert.deepEqual(breaker.getSnapshot("groq"), {
        state: "OPEN",
        failureCount: 2,
        openedAt: 1_000,
        lastFailureAt: 1_000,
        halfOpenTrialCount: 0,
    });
});

test("circuit breaker rejects immediately while OPEN before cooldown", async () => {
    const breaker = createBreaker();

    for (let index = 0; index < 2; index += 1) {
        await assert.rejects(
            breaker.execute("groq", async () => {
                throw createProviderError();
            }),
        );
    }

    await assert.rejects(
        breaker.execute("groq", async () => "should-not-run"),
        (error) => {
            assert.equal(error instanceof ProviderCircuitOpenError, true);
            assert.equal(error.isProviderError, true);
            assert.equal(error.category, "unavailable");
            assert.equal(error.providerId, "groq");
            assert.equal(error.statusCode, 503);

            return true;
        },
    );
});

test("circuit breaker closes after successful HALF_OPEN trial", async () => {
    const nowRef = { value: 1_000 };
    const breaker = createBreaker(nowRef);

    for (let index = 0; index < 2; index += 1) {
        await assert.rejects(
            breaker.execute("groq", async () => {
                throw createProviderError();
            }),
        );
    }

    nowRef.value = 2_000;

    const result = await breaker.execute("groq", async () => "ok");

    assert.equal(result, "ok");
    assert.deepEqual(breaker.getSnapshot("groq"), {
        state: "CLOSED",
        failureCount: 0,
        halfOpenTrialCount: 0,
    });
});

test("circuit breaker reopens after failed HALF_OPEN trial", async () => {
    const nowRef = { value: 1_000 };
    const breaker = createBreaker(nowRef);

    for (let index = 0; index < 2; index += 1) {
        await assert.rejects(
            breaker.execute("groq", async () => {
                throw createProviderError();
            }),
        );
    }

    nowRef.value = 2_000;

    await assert.rejects(
        breaker.execute("groq", async () => {
            throw createProviderError({ statusCode: 503 });
        }),
    );

    assert.deepEqual(breaker.getSnapshot("groq"), {
        state: "OPEN",
        failureCount: 2,
        openedAt: 2_000,
        lastFailureAt: 2_000,
        halfOpenTrialCount: 0,
    });
});
