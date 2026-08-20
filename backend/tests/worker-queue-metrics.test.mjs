import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, afterEach, before, beforeEach } from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.REDIS_URL =
    process.env.WORKER_METRICS_TEST_REDIS_URL
    ?? "redis://127.0.0.1:6379/14";

const [bullMqModule, metricsModule, redisModule] = await Promise.all([
    import("../dist/shared/async/bullmq.js"),
    import("../dist/shared/observability/metrics.js"),
    import("../dist/shared/lib/redis.js"),
]);

const {
    connectManagedQueue,
    createManagedQueue,
    createManagedWorker,
    disconnectBullMq,
    recordQueueEnqueued,
} = bullMqModule;
const { metricsRegistry } = metricsModule;
const { connectRedis, disconnectRedis } = redisModule;

let activeWorker;
let billingQueue;

before(async () => {
    await connectRedis();
    billingQueue = createManagedQueue("billing-queue");
    await connectManagedQueue(billingQueue);
    await billingQueue.obliterate({ force: true });
});

beforeEach(() => {
    metricsRegistry.resetMetrics();
});

afterEach(async () => {
    await activeWorker?.close();
    activeWorker = undefined;
    await billingQueue.obliterate({ force: true });
});

after(async () => {
    await disconnectBullMq();
    await disconnectRedis();
});

test("exports bounded enqueue and scrape-time queue depth metrics", async () => {
    await billingQueue.add("metrics.success", createJobData());
    recordQueueEnqueued("billing-queue");

    const output = await metricsRegistry.metrics();

    assert.match(
        output,
        /proxiai_queue_jobs_total\{queue="billing-queue",outcome="enqueued"\} 1/,
    );
    assert.match(
        output,
        /proxiai_queue_depth\{queue="billing-queue",state="waiting"\} 1/,
    );
});

test("records completed processing count and duration", async () => {
    activeWorker = createManagedWorker({
        queueName: "billing-queue",
        parse: parseJobData,
        async process() {},
    });
    await activeWorker.start();

    const job = await billingQueue.add("metrics.success", createJobData());
    await waitForJobState(job.id, "completed");

    const output = await metricsRegistry.metrics();

    assert.match(
        output,
        /proxiai_queue_jobs_total\{queue="billing-queue",outcome="completed"\} 1/,
    );
    assert.match(
        output,
        /proxiai_queue_job_duration_seconds_count\{queue="billing-queue",outcome="completed"\} 1/,
    );
});

test("distinguishes retryable and terminal processing failures", async () => {
    activeWorker = createManagedWorker({
        queueName: "billing-queue",
        parse: parseJobData,
        async process() {
            throw new Error("simulated transient worker failure");
        },
    });
    await activeWorker.start();

    const job = await billingQueue.add(
        "metrics.failure",
        createJobData(),
        {
            attempts: 2,
            backoff: { type: "fixed", delay: 1 },
        },
    );
    await waitForJobState(job.id, "failed");

    const output = await metricsRegistry.metrics();

    assert.match(
        output,
        /proxiai_queue_jobs_total\{queue="billing-queue",outcome="retried"\} 1/,
    );
    assert.match(
        output,
        /proxiai_queue_jobs_total\{queue="billing-queue",outcome="failed"\} 1/,
    );
    assert.match(
        output,
        /proxiai_queue_job_duration_seconds_count\{queue="billing-queue",outcome="retryable_failure"\} 1/,
    );
    assert.match(
        output,
        /proxiai_queue_job_duration_seconds_count\{queue="billing-queue",outcome="terminal_failure"\} 1/,
    );
});

test("exports fixed worker heartbeat state without reflecting unknown labels", async () => {
    activeWorker = createManagedWorker({
        queueName: "health-check-queue",
        parse: parseJobData,
        async process() {},
    });
    await activeWorker.start();
    await waitForHealthy(activeWorker);

    const sensitiveSentinel = "tenant@example.test:unknown-queue";
    recordQueueEnqueued(sensitiveSentinel);
    const runningOutput = await metricsRegistry.metrics();

    assert.match(
        runningOutput,
        /proxiai_worker_running\{worker="provider_health"\} 1/,
    );
    assert.match(
        runningOutput,
        /proxiai_worker_healthy\{worker="provider_health"\} 1/,
    );
    assert.match(
        runningOutput,
        /proxiai_worker_heartbeat_age_seconds\{worker="provider_health"\} [0-9.]+/,
    );
    assert.equal(runningOutput.includes(sensitiveSentinel), false);

    await activeWorker.close();
    activeWorker = undefined;

    const stoppedOutput = await metricsRegistry.metrics();
    assert.match(
        stoppedOutput,
        /proxiai_worker_running\{worker="provider_health"\} 0/,
    );
    assert.match(
        stoppedOutput,
        /proxiai_worker_healthy\{worker="provider_health"\} 0/,
    );
});

function createJobData() {
    return { requestId: randomUUID() };
}

function parseJobData(value) {
    if (
        typeof value !== "object"
        || value === null
        || typeof value.requestId !== "string"
    ) {
        throw new Error("Invalid test job payload.");
    }

    return value;
}

async function waitForJobState(jobId, expectedState) {
    const deadline = Date.now() + 10_000;

    while (Date.now() < deadline) {
        const job = await billingQueue.getJob(jobId);

        if (job !== undefined && await job.getState() === expectedState) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 20));
    }

    throw new Error(`Timed out waiting for ${expectedState} job state.`);
}

async function waitForHealthy(worker) {
    const deadline = Date.now() + 2_000;

    while (Date.now() < deadline) {
        if (worker.getHealth()?.healthy === true) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error("Timed out waiting for worker heartbeat.");
}
