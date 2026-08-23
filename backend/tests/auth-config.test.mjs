import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { authTestEnvironment } from "./helpers/test-env.mjs";

const validEnvironment = {
    ...process.env,
    ...authTestEnvironment,
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    PORT: "8080",
    FRONTEND_ORIGIN: "http://localhost:3000",
    MONGO_URI: "mongodb://localhost:27017/proxiai-test",
    REDIS_URL: "redis://localhost:6379",
};

function importEnvironment(overrides = {}) {
    const environment = {
        ...validEnvironment,
        ...overrides,
    };

    for (const [name, value] of Object.entries(environment)) {
        if (value === undefined) {
            delete environment[name];
        }
    }

    return spawnSync(
        process.execPath,
        [
            "--input-type=module",
            "--eval",
            `
                const { env } = await import("./dist/config/env.js");
                process.stdout.write(JSON.stringify({
                    accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
                    port: env.PORT,
                    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
                }));
            `,
        ],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: environment,
        },
    );
}

test("authentication settings are parsed through the typed environment boundary", () => {
    const result = importEnvironment();

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
        accessTokenTtlMinutes: 15,
        port: 8080,
        refreshTokenTtlDays: 7,
    });
});

test("API port honors Render input and retains the local 8080 default", () => {
    const renderResult = importEnvironment({ PORT: "10000" });
    const localResult = importEnvironment({ PORT: undefined });

    assert.equal(renderResult.status, 0, renderResult.stderr);
    assert.equal(localResult.status, 0, localResult.stderr);
    assert.equal(JSON.parse(renderResult.stdout).port, 10000);
    assert.equal(JSON.parse(localResult.stdout).port, 8080);
});

test("worker runtime settings do not require API-only environment values", () => {
    const workerEnvironment = {
        ...validEnvironment,
    };

    delete workerEnvironment.FRONTEND_ORIGIN;
    delete workerEnvironment.JWT_ACCESS_SECRET;
    delete workerEnvironment.AUTH_RATE_LIMIT_SECRET;
    delete workerEnvironment.ACCESS_TOKEN_TTL_MINUTES;
    delete workerEnvironment.REFRESH_TOKEN_TTL_DAYS;
    delete workerEnvironment.CHAT_RATE_LIMIT_FREE_USER_RPM;
    delete workerEnvironment.CHAT_RATE_LIMIT_FREE_ORG_RPM;
    delete workerEnvironment.CHAT_RATE_LIMIT_PRO_USER_RPM;
    delete workerEnvironment.CHAT_RATE_LIMIT_PRO_ORG_RPM;
    delete workerEnvironment.CHAT_RATE_LIMIT_ENTERPRISE_USER_RPM;
    delete workerEnvironment.CHAT_RATE_LIMIT_ENTERPRISE_ORG_RPM;
    delete workerEnvironment.IDEMPOTENCY_PROCESSING_TTL_SECONDS;
    delete workerEnvironment.IDEMPOTENCY_COMPLETED_TTL_SECONDS;

    const result = spawnSync(
        process.execPath,
        [
            "--input-type=module",
            "--eval",
            `
                const { runtimeEnv } =
                    await import("./dist/config/runtime-env.js");
                process.stdout.write(runtimeEnv.GROQ_MODEL);
            `,
        ],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: workerEnvironment,
        },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, workerEnvironment.GROQ_MODEL);
});

test("JWT secret must contain at least 32 decoded random bytes", () => {
    const rejectedSecret = Buffer.alloc(31, 7).toString("base64url");
    const result = importEnvironment({
        JWT_ACCESS_SECRET: rejectedSecret,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /JWT_ACCESS_SECRET/);
    assert.equal(result.stderr.includes(rejectedSecret), false);
});

test("rate-limit secret is independently validated", () => {
    const rejectedSecret = "not+base64url";
    const result = importEnvironment({
        AUTH_RATE_LIMIT_SECRET: rejectedSecret,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /AUTH_RATE_LIMIT_SECRET/);
    assert.equal(result.stderr.includes(rejectedSecret), false);
});

test("token lifetimes reject values outside approved bounds", () => {
    const result = importEnvironment({
        ACCESS_TOKEN_TTL_MINUTES: "0",
        REFRESH_TOKEN_TTL_DAYS: "31",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /ACCESS_TOKEN_TTL_MINUTES/);
    assert.match(result.stderr, /REFRESH_TOKEN_TTL_DAYS/);
});

test("production refresh cookie enables Secure without setting Domain", () => {
    const result = spawnSync(
        process.execPath,
        [
            "--input-type=module",
            "--eval",
            `
                const { getRefreshCookieOptions } =
                    await import("./dist/features/auth/refresh-token.service.js");
                process.stdout.write(
                    JSON.stringify(getRefreshCookieOptions()),
                );
            `,
        ],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: {
                ...validEnvironment,
                NODE_ENV: "production",
            },
        },
    );

    assert.equal(result.status, 0, result.stderr);

    const options = JSON.parse(result.stdout);

    assert.equal(options.secure, true);
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/api/v1/auth");
    assert.equal("domain" in options, false);
});
