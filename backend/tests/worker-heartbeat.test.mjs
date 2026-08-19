import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const [{ createManagedWorker }, { createWorkerHeartbeat }] = await Promise.all([
    import("../dist/shared/async/bullmq.js"),
    import("../dist/shared/async/worker-heartbeat.js"),
]);

test("heartbeat records safe health and successful-job timestamps", async () => {
    const clock = createClock("2026-08-19T10:00:00.000Z");
    const scheduler = createManualScheduler();
    const heartbeat = createWorkerHeartbeat({
        workerId: "billing-worker",
        workerType: "billing",
        intervalMs: 30_000,
        freshnessMs: 120_000,
        now: clock.now,
        scheduler,
        async probe() {},
        onFailure() {},
    });

    heartbeat.start();
    await flushPromises();
    clock.advance(1_000);
    heartbeat.recordSuccessfulJob();

    assert.deepEqual(heartbeat.getHealth(), {
        workerId: "billing-worker",
        workerType: "billing",
        running: true,
        healthy: true,
        lastHeartbeatAt: "2026-08-19T10:00:00.000Z",
        lastSuccessfulJobAt: "2026-08-19T10:00:01.000Z",
    });

    clock.advance(120_001);
    assert.equal(heartbeat.getHealth().healthy, false);
    await heartbeat.stop();
});

test("starting twice creates one timer and shutdown stops future probes", async () => {
    const scheduler = createManualScheduler();
    let probeCount = 0;
    const heartbeat = createWorkerHeartbeat({
        workerId: "billing-worker",
        workerType: "billing",
        intervalMs: 30_000,
        freshnessMs: 120_000,
        scheduler,
        async probe() {
            probeCount += 1;
        },
        onFailure() {},
    });

    heartbeat.start();
    heartbeat.start();
    await flushPromises();

    assert.equal(scheduler.size(), 1);
    assert.equal(probeCount, 1);

    await heartbeat.stop();
    scheduler.tick();
    await flushPromises();

    assert.equal(scheduler.size(), 0);
    assert.equal(probeCount, 1);
    assert.equal(heartbeat.getHealth().running, false);
    assert.equal(heartbeat.getHealth().healthy, false);
});

test("failed heartbeat is observable and never reports healthy", async () => {
    const scheduler = createManualScheduler();
    let failureCount = 0;
    const heartbeat = createWorkerHeartbeat({
        workerId: "billing-worker",
        workerType: "billing",
        intervalMs: 30_000,
        freshnessMs: 120_000,
        scheduler,
        async probe() {
            throw new Error("simulated heartbeat dependency failure");
        },
        onFailure() {
            failureCount += 1;
        },
    });

    heartbeat.start();
    await flushPromises();

    assert.equal(failureCount, 1);
    assert.deepEqual(heartbeat.getHealth(), {
        workerId: "billing-worker",
        workerType: "billing",
        running: true,
        healthy: false,
        lastHeartbeatAt: null,
        lastSuccessfulJobAt: null,
    });

    await heartbeat.stop();
});

test("managed worker heartbeat uses its existing BullMQ connection", async () => {
    const worker = createManagedWorker({
        queueName: `heartbeat-test-${randomUUID()}`,
        parse: (value) => value,
        async process() {},
        heartbeat: {
            workerId: "billing-worker",
            workerType: "billing",
            intervalMs: 30_000,
            freshnessMs: 120_000,
        },
    });

    try {
        await worker.start();
        await waitForHealthy(worker);

        assert.equal(worker.getHealth()?.running, true);
        assert.equal(worker.getHealth()?.healthy, true);
    } finally {
        await worker.close();
    }

    assert.equal(worker.getHealth()?.running, false);
    assert.equal(worker.getHealth()?.healthy, false);
});

function createClock(initialIso) {
    let currentMs = Date.parse(initialIso);

    return {
        now: () => new Date(currentMs),
        advance(ms) {
            currentMs += ms;
        },
    };
}

function createManualScheduler() {
    const callbacks = new Set();

    return {
        setInterval(callback) {
            callbacks.add(callback);
            return callback;
        },
        clearInterval(handle) {
            callbacks.delete(handle);
        },
        tick() {
            for (const callback of callbacks) {
                callback();
            }
        },
        size() {
            return callbacks.size;
        },
    };
}

async function flushPromises() {
    await new Promise((resolve) => setImmediate(resolve));
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
