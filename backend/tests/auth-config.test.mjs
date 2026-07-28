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
    return spawnSync(
        process.execPath,
        [
            "--input-type=module",
            "--eval",
            `
                const { env } = await import("./dist/config/env.js");
                process.stdout.write(JSON.stringify({
                    accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
                    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
                }));
            `,
        ],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: {
                ...validEnvironment,
                ...overrides,
            },
        },
    );
}

test("authentication settings are parsed through the typed environment boundary", () => {
    const result = importEnvironment();

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
        accessTokenTtlMinutes: 15,
        refreshTokenTtlDays: 7,
    });
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
