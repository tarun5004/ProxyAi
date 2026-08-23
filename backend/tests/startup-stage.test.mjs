import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { authTestEnvironment } from "./helpers/test-env.mjs";

const {
    ApiStartupStageError,
    runApiStartupStage,
} = await import("../dist/shared/runtime/startup-stage.js");

test("startup stage failures expose only safe stage metadata", async () => {
    const sensitiveSentinel = "SENTINEL_SECRET_CONNECTION_VALUE";

    await assert.rejects(
        runApiStartupStage(
            "encryption_readiness",
            "ENCRYPTION_READINESS_FAILED",
            () => {
                throw new Error(sensitiveSentinel);
            },
        ),
        (error) => {
            assert.equal(error instanceof ApiStartupStageError, true);
            assert.equal(error.startupStage, "encryption_readiness");
            assert.equal(error.errorCode, "ENCRYPTION_READINESS_FAILED");
            assert.equal(error.message.includes(sensitiveSentinel), false);
            assert.equal(JSON.stringify(error).includes(sensitiveSentinel), false);
            return true;
        },
    );
});

test("API startup logs the safe failing stage without configuration values", () => {
    const sensitiveSentinel = "SENTINEL_ENCRYPTION_KEY_VALUE";
    const result = spawnSync(process.execPath, ["dist/server.js"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
            ...process.env,
            ...authTestEnvironment,
            NODE_ENV: "test",
            LOG_LEVEL: "info",
            PORT: "8080",
            FRONTEND_ORIGIN: "http://localhost:3000",
            MONGO_URI: "mongodb://localhost/proxiai-startup-test",
            REDIS_URL: "redis://localhost:6379",
            MESSAGE_ENCRYPTION_KEYS_JSON: JSON.stringify({
                1: sensitiveSentinel,
            }),
            MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION: "1",
        },
    });

    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout.includes(sensitiveSentinel), false);
    assert.equal(result.stderr.includes(sensitiveSentinel), false);

    const entries = result.stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    const failure = entries.find(
        (entry) => entry.event === "app.startup.failed",
    );

    assert.equal(failure?.startupStage, "encryption_initialization");
    assert.equal(failure?.errorCode, "ENCRYPTION_INITIALIZATION_FAILED");
});
