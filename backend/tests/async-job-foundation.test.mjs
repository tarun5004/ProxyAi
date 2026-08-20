import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3001";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_async_test";
process.env.REDIS_URL =
    process.env.ASYNC_JOB_TEST_REDIS_URL
    ?? "redis://127.0.0.1:6379/15";

const [
    jobContractModule,
    bullMqModule,
    billingQueueModule,
    redisModule,
] = await Promise.all([
    import("../dist/shared/async/job-contract.js"),
    import("../dist/shared/async/bullmq.js"),
    import("../dist/features/billing/billing.queue.js"),
    import("../dist/shared/lib/redis.js"),
]);

const {
    ASYNC_JOB_SCHEMA_VERSION,
    InvalidAsyncJobPayloadError,
    parseRequestCompletedJob,
    REQUEST_COMPLETED_JOB_TYPE,
} = jobContractModule;
const {
    BULLMQ_BACKOFF_DELAY_MS,
    BULLMQ_FAILED_RETENTION_COUNT,
    BULLMQ_JOB_ATTEMPTS,
    createManagedWorker,
    disconnectBullMq,
} = bullMqModule;
const {
    connectBillingQueue,
    enqueueRequestCompletedJob,
    getBillingQueue,
} = billingQueueModule;
const { connectRedis, disconnectRedis } = redisModule;

let activeWorker;
let billingQueue;

test.before(async () => {
    await connectRedis();
    await connectBillingQueue();
    billingQueue = getBillingQueue();
    await billingQueue.obliterate({ force: true });
});

test.afterEach(async () => {
    await activeWorker?.close();
    activeWorker = undefined;
    await billingQueue.obliterate({ force: true });
});

test.after(async () => {
    await disconnectBullMq();
    await disconnectRedis();
});

test("accepts and freezes a valid canonical request-completed job", () => {
    const payload = createValidPayload();
    const parsed = parseRequestCompletedJob(payload);

    assert.deepEqual(parsed, payload);
    assert.equal(Object.isFrozen(parsed), true);
    assert.equal(Object.isFrozen(parsed.usage), true);
});

test("rejects malformed or unexpected sensitive payload fields", async () => {
    const invalidPayload = {
        ...createValidPayload(),
        requestId: "not-a-uuid",
        prompt: "raw-sensitive-sentinel",
    };

    assert.throws(
        () => parseRequestCompletedJob(invalidPayload),
        InvalidAsyncJobPayloadError,
    );
    await assert.rejects(
        enqueueRequestCompletedJob(invalidPayload),
        InvalidAsyncJobPayloadError,
    );
    assert.equal(await billingQueue.count(), 0);
});

test("enqueues a validated job with bounded retry and retention options", async () => {
    const payload = createValidPayload();
    const job = await enqueueRequestCompletedJob(payload);

    assert.equal(job.name, REQUEST_COMPLETED_JOB_TYPE);
    assert.equal(job.data.requestId, payload.requestId);
    assert.equal(job.opts.attempts, BULLMQ_JOB_ATTEMPTS);
    assert.deepEqual(job.opts.backoff, {
        delay: BULLMQ_BACKOFF_DELAY_MS,
        type: "exponential",
    });
    assert.equal(job.opts.removeOnFail, BULLMQ_FAILED_RETENTION_COUNT);
    assert.equal(job.id.includes(":"), false);
});

test("retries transient worker failures three times and retains the failed job", async () => {
    const observedContexts = [];

    activeWorker = createManagedWorker({
        queueName: billingQueue.name,
        parse: parseRequestCompletedJob,
        async process(data, context) {
            observedContexts.push(context);
            assert.equal(context.requestId, data.requestId);
            assert.equal(context.log.bindings().requestId, data.requestId);
            assert.equal(context.log.bindings().service, "proxiai-worker");
            throw new Error("simulated transient dependency failure");
        },
    });
    await activeWorker.start();

    const job = await enqueueRequestCompletedJob(createValidPayload());
    const failedJob = await waitForFailedJob(job.id);

    assert.equal(failedJob.attemptsMade, BULLMQ_JOB_ATTEMPTS);
    assert.equal(await failedJob.getState(), "failed");
    assert.equal(observedContexts.length, BULLMQ_JOB_ATTEMPTS);
});

function createValidPayload() {
    return {
        schemaVersion: ASYNC_JOB_SCHEMA_VERSION,
        jobType: REQUEST_COMPLETED_JOB_TYPE,
        requestId: randomUUID(),
        orgId: randomUUID(),
        userId: randomUUID(),
        status: "COMPLETED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        usage: {
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
        },
        occurredAt: new Date().toISOString(),
    };
}

async function waitForFailedJob(jobId) {
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
        const job = await billingQueue.getJob(jobId);

        if (job !== undefined && await job.getState() === "failed") {
            return job;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error("Timed out waiting for failed BullMQ job.");
}
