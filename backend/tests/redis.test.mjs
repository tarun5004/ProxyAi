import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { authTestEnvironment } from "./helpers/test-env.mjs";

const safeEnvironment = {
    ...process.env,
    ...authTestEnvironment,
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    PORT: "8080",
    FRONTEND_ORIGIN: "http://localhost:3000",
    MONGO_URI: "mongodb://localhost:27017/proxiai-test",
    REDIS_URL: "redis://:SENTINEL_REDIS_PASSWORD@localhost:6379",
};

function runModuleScript(script) {
    return spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", script],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: safeEnvironment,
        },
    );
}

test("Redis reconnect delay is bounded", () => {
    const result = runModuleScript(`
        const {
            getRedisReconnectDelay,
            REDIS_MAX_RECONNECT_ATTEMPTS,
            REDIS_MAX_RECONNECT_DELAY_MS,
        } = await import("./dist/shared/lib/redis.js");

        console.log("RESULT:" + JSON.stringify({
            afterMaximum: getRedisReconnectDelay(REDIS_MAX_RECONNECT_ATTEMPTS + 1),
            cappedDelay: getRedisReconnectDelay(REDIS_MAX_RECONNECT_ATTEMPTS),
            firstDelay: getRedisReconnectDelay(1),
            maximumDelay: REDIS_MAX_RECONNECT_DELAY_MS,
        }));
    `);

    assert.equal(result.status, 0, result.stderr);

    const resultLine = result.stdout
        .trim()
        .split(/\r?\n/)
        .find((line) => line.startsWith("RESULT:"));

    assert.notEqual(resultLine, undefined);

    const data = JSON.parse(resultLine.slice("RESULT:".length));

    assert.equal(data.firstDelay, 200);
    assert.equal(data.cappedDelay, data.maximumDelay);
    assert.equal(data.afterMaximum, null);
});

test("Redis starts disconnected and connection failures are logged safely", () => {
    const result = runModuleScript(`
        const redisModule = await import("./dist/shared/lib/redis.js");

        const readyBeforeConnect = redisModule.isRedisReady();
        redisModule.redis.connect = async () => {
            throw new Error("SENTINEL_REDIS_ERROR");
        };

        try {
            await redisModule.connectRedis();
        } catch {
            console.log("RESULT:" + JSON.stringify({
                readyAfterFailure: redisModule.isRedisReady(),
                readyBeforeConnect,
            }));
        } finally {
            await redisModule.disconnectRedis();
        }
    `);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("SENTINEL_REDIS_PASSWORD"), false);
    assert.equal(result.stdout.includes("SENTINEL_REDIS_ERROR"), false);

    const lines = result.stdout.trim().split(/\r?\n/);
    const resultLine = lines.find((line) => line.startsWith("RESULT:"));

    assert.notEqual(resultLine, undefined);

    const resultData = JSON.parse(resultLine.slice("RESULT:".length));
    const logEntries = lines
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line));

    assert.equal(resultData.readyBeforeConnect, false);
    assert.equal(resultData.readyAfterFailure, false);
    assert.equal(
        logEntries.some(
            (entry) => entry.event === "redis.connection.failed"
                && entry.errorCode === "REDIS_CONNECTION_FAILED",
        ),
        true,
    );
});

test("Redis connection lifecycle reports ready and disconnects cleanly", () => {
    const result = runModuleScript(`
        const redisModule = await import("./dist/shared/lib/redis.js");

        redisModule.redis.connect = async () => {
            redisModule.redis.status = "ready";
            redisModule.redis.emit("ready");
        };
        redisModule.redis.quit = async () => {
            redisModule.redis.status = "end";
            return "OK";
        };

        await redisModule.connectRedis();
        const readyAfterConnect = redisModule.isRedisReady();
        await redisModule.disconnectRedis();

        console.log("RESULT:" + JSON.stringify({
            readyAfterConnect,
            readyAfterDisconnect: redisModule.isRedisReady(),
        }));
    `);

    assert.equal(result.status, 0, result.stderr);

    const lines = result.stdout.trim().split(/\r?\n/);
    const resultLine = lines.find((line) => line.startsWith("RESULT:"));

    assert.notEqual(resultLine, undefined);

    const resultData = JSON.parse(resultLine.slice("RESULT:".length));
    const logEntries = lines
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line));

    assert.equal(resultData.readyAfterConnect, true);
    assert.equal(resultData.readyAfterDisconnect, false);
    assert.equal(
        logEntries.some((entry) => entry.event === "redis.connected"),
        true,
    );
    assert.equal(
        logEntries.some((entry) => entry.event === "redis.disconnected"),
        true,
    );
});
