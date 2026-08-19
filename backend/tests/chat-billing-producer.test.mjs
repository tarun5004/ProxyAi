import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const { finalizeChatStream } = await import(
    "../dist/features/chat/chat.service.js"
);

function createRuntime({ enqueueError } = {}) {
    const order = [];
    const requestLogs = [];
    const billingJobs = [];
    const analyticsJobs = [];
    let completed = 0;
    const prepared = {
        requestId: randomUUID(),
        orgId: randomUUID(),
        userId: randomUUID(),
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        decision: {
            action: "ALLOW",
        },
        reservation: {
            async markCompleted() {
                completed += 1;
            },
        },
    };
    const dependencies = {
        async appendUsage(input) {
            order.push("request-log");
            requestLogs.push(structuredClone(input));
            return input;
        },
        async enqueueBillingJob(input) {
            order.push("billing-job");

            if (enqueueError !== undefined) {
                throw enqueueError;
            }

            billingJobs.push(structuredClone(input));
            return input;
        },
        async enqueueAnalyticsJob(input) {
            order.push("analytics-job");
            analyticsJobs.push(structuredClone(input));
            return input;
        },
        async recordEnqueueFailure() {},
    };

    return {
        dependencies,
        prepared,
        order,
        requestLogs,
        billingJobs,
        analyticsJobs,
        get completed() {
            return completed;
        },
    };
}

test("completed request persists usage before one safe billing job", async () => {
    const runtime = createRuntime();
    const usage = {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
    };

    await finalizeChatStream(
        runtime.prepared,
        {
            status: "COMPLETED",
            usage,
        },
        runtime.dependencies,
    );

    assert.deepEqual(runtime.order, [
        "request-log",
        "billing-job",
        "analytics-job",
    ]);
    assert.equal(runtime.billingJobs.length, 1);
    assert.deepEqual(runtime.billingJobs[0]?.usage, usage);
    assert.equal("estimatedCostMicros" in runtime.billingJobs[0], false);
    assert.equal(runtime.completed, 1);
    assert.deepEqual(
        Object.keys(runtime.billingJobs[0]).sort(),
        [
            "jobType",
            "model",
            "occurredAt",
            "orgId",
            "policyAction",
            "providerId",
            "requestId",
            "schemaVersion",
            "status",
            "usage",
            "userId",
        ],
    );
});

test("unknown provider usage stays omitted", async () => {
    const runtime = createRuntime();

    await finalizeChatStream(
        runtime.prepared,
        { status: "INTERRUPTED" },
        runtime.dependencies,
    );

    assert.equal(runtime.requestLogs.length, 1);
    assert.equal("usage" in runtime.requestLogs[0], false);
    assert.equal(runtime.billingJobs.length, 1);
    assert.equal("usage" in runtime.billingJobs[0], false);
    assert.equal("estimatedCostMicros" in runtime.billingJobs[0], false);
});

test("enqueue failure preserves authoritative RequestLog and completion", async () => {
    const runtime = createRuntime({
        enqueueError: new Error("Queue unavailable"),
    });
    const usage = {
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5,
    };

    await finalizeChatStream(
        runtime.prepared,
        {
            status: "COMPLETED",
            usage,
        },
        runtime.dependencies,
    );

    assert.equal(runtime.requestLogs.length, 1);
    assert.deepEqual(runtime.requestLogs[0]?.usage, usage);
    assert.equal(runtime.billingJobs.length, 0);
    assert.equal(runtime.completed, 1);
});
