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

const [{ selectProductionCandidate }, queueModule, storeModule, workerModule] =
    await Promise.all([
        import("../dist/features/chat/chat.service.js"),
        import("../dist/features/providers/provider-health.queue.js"),
        import("../dist/features/providers/provider-health.store.js"),
        import("../dist/features/providers/provider-health.worker.js"),
    ]);

const { PROVIDER_HEALTH_SCHEDULE_MS } = queueModule;
const {
    PROVIDER_HEALTH_TTL_SECONDS,
    readProviderHealth,
    writeProviderHealth,
} = storeModule;
const { processProviderHealthCheckJob } = workerModule;

test("healthy provider writes HEALTHY with the approved Redis TTL", async () => {
    const writes = [];
    const client = createRedisClient({ writes });

    await processProviderHealthCheckJob(
        createJob(),
        jobContext(),
        undefined,
        createDependencies({
            status: "healthy",
            writeHealth: (providerId, record) =>
                writeProviderHealth(providerId, record, client),
        }),
    );

    assert.equal(writes.length, 1);
    assert.equal(PROVIDER_HEALTH_SCHEDULE_MS, 60_000);
    assert.equal(writes[0].key, "health:groq");
    assert.equal(writes[0].expirationMode, "EX");
    assert.equal(writes[0].ttlSeconds, PROVIDER_HEALTH_TTL_SECONDS);
    assert.deepEqual(JSON.parse(writes[0].value), {
        state: "HEALTHY",
        checkedAt: "2026-08-19T12:00:00.000Z",
    });
});

test("unhealthy maps to UNHEALTHY and degraded maps to UNKNOWN", async () => {
    const records = [];

    for (const status of ["unhealthy", "degraded"]) {
        await processProviderHealthCheckJob(
            createJob(),
            jobContext(),
            undefined,
            createDependencies({
                status,
                writeHealth: async (_providerId, record) => {
                    records.push(record);
                },
            }),
        );
    }

    assert.deepEqual(
        records.map((record) => record.state),
        ["UNHEALTHY", "UNKNOWN"],
    );
});

test("missing or expired provider-health key reads as UNKNOWN", async () => {
    const health = await readProviderHealth(
        "groq",
        createRedisClient({ value: null }),
    );

    assert.deepEqual(health, { state: "UNKNOWN" });
});

test("routing skips only UNHEALTHY provider state", async () => {
    const candidate = {
        adapter: { providerId: "groq" },
        model: "test-model",
    };
    const request = { routingMode: "auto" };

    await assert.rejects(
        selectProductionCandidate(
            request,
            [candidate],
            async () => ({ state: "UNHEALTHY" }),
        ),
        (error) => {
            assert.equal(error.statusCode, 503);
            assert.equal(error.code, "PROVIDER_UNAVAILABLE");

            return true;
        },
    );

    assert.equal(
        await selectProductionCandidate(
            request,
            [candidate],
            async () => ({ state: "UNKNOWN" }),
        ),
        candidate,
    );
});

function createDependencies({ status, writeHealth }) {
    return {
        getAdapter() {
            return {
                providerId: "groq",
                async checkHealth() {
                    return {
                        providerId: "groq",
                        status,
                        checkedAt: new Date("2026-08-19T12:00:00.000Z"),
                    };
                },
            };
        },
        writeHealth,
        now: () => new Date("2026-08-19T12:00:00.000Z"),
    };
}

function createJob() {
    return {
        schemaVersion: 1,
        jobType: "provider.health_check",
        requestId: randomUUID(),
        providerId: "groq",
        occurredAt: "2026-08-19T12:00:00.000Z",
    };
}

function jobContext() {
    return {
        jobId: "provider-health-test",
        attemptsMade: 0,
    };
}

function createRedisClient({ value = null, writes = [] } = {}) {
    return {
        async get() {
            return value;
        },
        async set(key, storedValue, expirationMode, ttlSeconds) {
            writes.push({
                key,
                value: storedValue,
                expirationMode,
                ttlSeconds,
            });

            return "OK";
        },
    };
}
