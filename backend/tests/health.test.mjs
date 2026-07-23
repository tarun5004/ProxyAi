import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

process.env.NODE_ENV ??= "test";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.COMMIT_SHA = "health-test-sha";

const [{ app }, mongooseModule, redisModule] = await Promise.all([
    import("../dist/app.js"),
    import("mongoose"),
    import("../dist/shared/lib/redis.js"),
]);

const mongoose = mongooseModule.default;
const { redis } = redisModule;

async function requestHealth(path) {
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    try {
        return await fetch(`http://127.0.0.1:${address.port}${path}`);
    } finally {
        server.close();
        await once(server, "close");
    }
}

test("liveness is dependency-free and includes deployment metadata", async () => {
    const response = await requestHealth("/health/live");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "proxiai-api");
    assert.equal(body.version, "1.0.0");
    assert.equal(body.commitSha, "health-test-sha");
    assert.equal(Number.isNaN(Date.parse(body.time)), false);
    assert.equal("checks" in body, false);
});

test("readiness returns 503 when dependencies are unavailable", async () => {
    const response = await requestHealth("/health/ready");
    const body = await response.json();
    const serializedBody = JSON.stringify(body);

    assert.equal(response.status, 503);
    assert.equal(body.status, "not_ready");
    assert.deepEqual(body.checks, {
        mongo: "down",
        redis: "down",
    });
    assert.equal(serializedBody.includes(process.env.MONGO_URI), false);
    assert.equal(serializedBody.includes(process.env.REDIS_URL), false);
});

test("readiness returns 200 when MongoDB and Redis are ready", async () => {
    const originalMongoState = mongoose.connection.readyState;
    const originalRedisStatus = redis.status;

    Object.defineProperty(mongoose.connection, "readyState", {
        configurable: true,
        value: 1,
    });
    Object.defineProperty(redis, "status", {
        configurable: true,
        value: "ready",
    });

    try {
        const response = await requestHealth("/health/ready");
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.status, "ready");
        assert.deepEqual(body.checks, {
            mongo: "up",
            redis: "up",
        });
    } finally {
        Object.defineProperty(mongoose.connection, "readyState", {
            configurable: true,
            value: originalMongoState,
        });
        Object.defineProperty(redis, "status", {
            configurable: true,
            value: originalRedisStatus,
        });
    }
});
