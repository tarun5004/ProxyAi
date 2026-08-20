import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { beforeEach } from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();

const [
    { AppError },
    {
        createIdempotencyRequestFingerprint,
        createIdempotencyService,
    },
    { metricsRegistry },
] = await Promise.all([
    import("../dist/shared/errors/app-error.js"),
    import("../dist/shared/idempotency/idempotency.service.js"),
    import("../dist/shared/observability/metrics.js"),
]);

beforeEach(() => {
    metricsRegistry.resetMetrics();
});

test("records successful reservation, completion, and release outcomes", async () => {
    const completed = createIdempotencyService(sequenceStore(["RESERVED", 1]));
    const released = createIdempotencyService(sequenceStore(["RESERVED", 1]));
    const completedReservation = await completed.reserve(createInput());
    const releasedReservation = await released.reserve(createInput());

    await completedReservation.markCompleted();
    await releasedReservation.releaseBeforeExecution();

    const output = await metricsRegistry.metrics();

    assert.match(output, metricLine("reserve", "reserved", 2));
    assert.match(output, metricLine("mark_completed", "completed", 1));
    assert.match(
        output,
        metricLine("release_before_execution", "released", 1),
    );
});

test("records bounded duplicate and fingerprint mismatch outcomes", async () => {
    const input = createInput();
    const processingRecord = JSON.stringify({
        status: "PROCESSING",
        requestId: randomUUID(),
        requestFingerprint: input.requestFingerprint,
        startedAt: new Date().toISOString(),
    });
    const completedRecord = JSON.stringify({
        status: "COMPLETED",
        requestId: randomUUID(),
        requestFingerprint: input.requestFingerprint,
        completedAt: new Date().toISOString(),
    });
    const mismatchRecord = JSON.stringify({
        status: "PROCESSING",
        requestId: randomUUID(),
        requestFingerprint: "f".repeat(64),
        startedAt: new Date().toISOString(),
    });

    await assert.rejects(
        createIdempotencyService(sequenceStore([processingRecord])).reserve(input),
        hasAppError("REQUEST_IN_PROGRESS", 409),
    );
    await assert.rejects(
        createIdempotencyService(sequenceStore([completedRecord])).reserve(input),
        hasAppError("DUPLICATE_REQUEST", 409),
    );
    await assert.rejects(
        createIdempotencyService(sequenceStore([mismatchRecord])).reserve(input),
        hasAppError("DUPLICATE_REQUEST", 409),
    );

    const output = await metricsRegistry.metrics();

    assert.match(output, metricLine("reserve", "processing_duplicate", 1));
    assert.match(output, metricLine("reserve", "completed_duplicate", 1));
    assert.match(output, metricLine("reserve", "fingerprint_mismatch", 1));
});

test("records fail-closed outcomes without Redis keys or trusted identifiers", async () => {
    const rawIdentifierSentinel = "SENTINEL_CLIENT_IDENTIFIER";
    const unavailable = createIdempotencyService({
        async evaluate() {
            throw new Error("SENTINEL_REDIS_ERROR");
        },
    });
    const input = createInput({ clientRequestId: rawIdentifierSentinel });

    await assert.rejects(
        unavailable.reserve(input),
        hasAppError("IDEMPOTENCY_UNAVAILABLE", 503),
    );

    const reserved = await createIdempotencyService(
        sequenceStore(["RESERVED"]),
    ).reserve(createInput());
    reserved.markProviderExecutionStarted();
    await assert.rejects(
        reserved.releaseBeforeExecution(),
        hasAppError("IDEMPOTENCY_UNAVAILABLE", 503),
    );

    const output = await metricsRegistry.metrics();

    assert.match(output, metricLine("reserve", "unavailable", 1));
    assert.match(
        output,
        metricLine(
            "release_before_execution",
            "release_refused_after_provider_start",
            1,
        ),
    );
    assert.equal(output.includes(rawIdentifierSentinel), false);
    assert.equal(output.includes("SENTINEL_REDIS_ERROR"), false);
    assert.equal(output.includes("chat:idempotency:"), false);
});

function createInput(overrides = {}) {
    return {
        orgId: randomUUID(),
        userId: randomUUID(),
        clientRequestId: randomUUID(),
        requestId: randomUUID(),
        requestFingerprint: createIdempotencyRequestFingerprint({
            conversationId: randomUUID(),
            prompt: "Safe request",
            providerId: "groq",
            routingMode: "manual",
        }),
        ...overrides,
    };
}

function sequenceStore(results) {
    let index = 0;

    return {
        async evaluate() {
            const result = results[index];
            index += 1;
            return result;
        },
    };
}

function hasAppError(code, statusCode) {
    return (error) => error instanceof AppError
        && error.code === code
        && error.statusCode === statusCode;
}

function metricLine(operation, outcome, value) {
    return new RegExp(
        `proxiai_idempotency_operations_total\\{operation="${operation}",outcome="${outcome}"\\} ${value}`,
    );
}
