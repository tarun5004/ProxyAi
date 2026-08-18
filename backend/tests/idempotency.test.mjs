import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [
    { AppError },
    {
        createIdempotencyRequestFingerprint,
        createIdempotencyService,
    },
    { connectRedis, disconnectRedis, redis },
] = await Promise.all([
    import("../dist/shared/errors/app-error.js"),
    import("../dist/shared/idempotency/idempotency.service.js"),
    import("../dist/shared/lib/redis.js"),
]);

before(async () => {
    await connectRedis();
    assert.equal(await redis.ping(), "PONG");
});

after(async () => {
    await disconnectRedis();
});

test("ten concurrent reservations produce one winner with canonical state TTLs", async () => {
    const rawPromptSentinel = "SENTINEL_PROMPT_ada@example.com";
    const fingerprintConversationId = randomUUID();
    const scope = createScope({
        requestFingerprint: createFingerprint(
            rawPromptSentinel,
            fingerprintConversationId,
        ),
    });
    const service = createIdempotencyService();
    let providerCalls = 0;
    const attempts = Array.from({ length: 10 }, async () => {
        try {
            const reservation = await service.reserve({
                ...scope,
                requestId: randomUUID(),
            });
            providerCalls += 1;

            return {
                reservation,
                status: "reserved",
            };
        } catch (error) {
            return { error, status: "rejected" };
        }
    });
    const results = await Promise.all(attempts);
    const winners = results.filter((result) => result.status === "reserved");
    const rejected = results.filter((result) => result.status === "rejected");
    const key = deriveExpectedKey(scope);

    try {
        assert.equal(winners.length, 1);
        assert.equal(rejected.length, 9);
        assert.equal(providerCalls, 1);
        assert.equal(
            rejected.every(
                (result) => result.error instanceof AppError
                    && result.error.statusCode === 409
                    && result.error.code === "REQUEST_IN_PROGRESS",
            ),
            true,
        );

        const processingValue = await redis.get(key);
        const processingRecord = JSON.parse(processingValue);
        const processingTtl = await redis.ttl(key);

        assert.equal(processingRecord.status, "PROCESSING");
        assert.equal(
            processingRecord.requestFingerprint,
            scope.requestFingerprint,
        );
        assert.equal(processingTtl > 0 && processingTtl <= 300, true);
        assert.equal(processingValue.includes(rawPromptSentinel), false);
        assert.equal(
            [scope.orgId, scope.userId, scope.clientRequestId].some(
                (identifier) => key.includes(identifier)
                    || processingValue.includes(identifier),
            ),
            false,
        );
        await assert.rejects(
            service.reserve({
                ...scope,
                requestFingerprint: createFingerprint(
                    "Different request",
                    fingerprintConversationId,
                ),
                requestId: randomUUID(),
            }),
            (error) => error instanceof AppError
                && error.statusCode === 409
                && error.code === "DUPLICATE_REQUEST",
        );

        await winners[0].reservation.markCompleted();

        const completedRecord = JSON.parse(await redis.get(key));
        const completedTtl = await redis.ttl(key);

        assert.equal(completedRecord.status, "COMPLETED");
        assert.deepEqual(
            Object.keys(completedRecord).sort(),
            [
                "completedAt",
                "requestFingerprint",
                "requestId",
                "status",
            ],
        );
        assert.equal(completedTtl > 300 && completedTtl <= 3_600, true);
        await assert.rejects(
            service.reserve({
                ...scope,
                requestId: randomUUID(),
            }),
            (error) => error instanceof AppError
                && error.statusCode === 409
                && error.code === "DUPLICATE_REQUEST",
        );
    } finally {
        await redis.del(key);
    }
});

test("same client request ID remains isolated by trusted organisation and user", async () => {
    const clientRequestId = randomUUID();
    const scopes = [
        createScope({ clientRequestId }),
        createScope({ clientRequestId }),
        createScope({ clientRequestId }),
    ];
    scopes[1].orgId = scopes[0].orgId;
    const service = createIdempotencyService();
    const reservations = await Promise.all(
        scopes.map((scope) => service.reserve({
            ...scope,
            requestId: randomUUID(),
        })),
    );

    try {
        assert.equal(new Set(scopes.map(deriveExpectedKey)).size, 3);
    } finally {
        await Promise.all(
            reservations.map((reservation) =>
                reservation.releaseBeforeExecution()
            ),
        );
    }
});

test("release before provider execution permits a safe retry", async () => {
    const scope = createScope();
    const service = createIdempotencyService();
    const first = await service.reserve({
        ...scope,
        requestId: randomUUID(),
    });

    await first.releaseBeforeExecution();

    const retry = await service.reserve({
        ...scope,
        requestId: randomUUID(),
    });

    await retry.releaseBeforeExecution();
});

test("Redis failure returns canonical fail-closed error", async () => {
    const service = createIdempotencyService({
        async evaluate() {
            throw new Error("SENTINEL_REDIS_FAILURE");
        },
    });

    await assert.rejects(
        service.reserve({
            ...createScope(),
            requestId: randomUUID(),
        }),
        (error) => error instanceof AppError
            && error.statusCode === 503
            && error.code === "IDEMPOTENCY_UNAVAILABLE"
            && !error.message.includes("SENTINEL_REDIS_FAILURE"),
    );
});

function createScope(overrides = {}) {
    return {
        orgId: randomUUID(),
        userId: randomUUID(),
        clientRequestId: randomUUID(),
        requestFingerprint: createFingerprint("Safe request"),
        ...overrides,
    };
}

function createFingerprint(prompt, conversationId = randomUUID()) {
    return createIdempotencyRequestFingerprint({
        conversationId,
        prompt,
        providerId: "groq",
        routingMode: "manual",
    });
}

function deriveExpectedKey(scope) {
    const secret = Buffer.from(
        process.env.AUTH_RATE_LIMIT_SECRET,
        "base64url",
    );
    const digest = createHmac("sha256", secret)
        .update("chat:idempotency")
        .update("\0")
        .update([
            scope.orgId,
            scope.userId,
            scope.clientRequestId,
        ].join("\0"))
        .digest("hex");

    return `chat:idempotency:${digest}`;
}
