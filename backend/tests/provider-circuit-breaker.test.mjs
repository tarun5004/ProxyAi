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

test("non-retryable failures do not count and reset clears provider state", async () => {
    const breaker = createBreaker();

    await assert.rejects(
        breaker.execute("groq", async () => {
            throw createProviderError({
                category: "authentication",
                retryable: false,
                statusCode: 401,
            });
        }),
    );
    assert.deepEqual(breaker.getSnapshot("groq"), {
        state: "CLOSED",
        failureCount: 0,
        halfOpenTrialCount: 0,
    });

    await assert.rejects(breaker.execute("third", async () => {
        throw createProviderError({ providerId: "third" });
    }));
    breaker.reset("third");
    breaker.reset();

    assert.equal(breaker.isOpen("third"), false);
});

test("HALF_OPEN allows only the configured concurrent trial", async () => {
    const nowRef = { value: 1_000 };
    const breaker = createBreaker(nowRef);
    let releaseTrial;
    const trialGate = new Promise((resolve) => {
        releaseTrial = resolve;
    });

    for (let index = 0; index < 2; index += 1) {
        await assert.rejects(breaker.execute("groq", async () => {
            throw createProviderError();
        }));
    }
    nowRef.value = 2_000;

    const firstTrial = breaker.execute("groq", async () => {
        await trialGate;
        return "ok";
    });
    await assert.rejects(
        breaker.execute("groq", async () => "unexpected"),
        (error) => error instanceof ProviderCircuitOpenError,
    );
    releaseTrial();
    assert.equal(await firstTrial, "ok");
});

test("invalid breaker policies fail before accepting traffic", () => {
    assert.throws(
        () => new ProviderCircuitBreaker({
            policy: {
                failureThreshold: 0,
                cooldownMs: 1_000,
                halfOpenMaxTrials: 1,
            },
        }),
        /Invalid provider circuit breaker policy/,
    );
});

test("default circuit policy permits a healthy first request", async () => {
    const breaker = new ProviderCircuitBreaker();

    assert.equal(await breaker.execute("groq", async () => "ok"), "ok");
    assert.deepEqual(breaker.getSnapshot("groq"), {
        state: "CLOSED",
        failureCount: 0,
        halfOpenTrialCount: 0,
    });
});
