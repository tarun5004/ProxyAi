import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { decodeProtectedHeader, jwtVerify } from "jose";

import {
    applyAuthTestEnvironment,
    authTestEnvironment,
} from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [
    { AppError },
    {
        createLoginRateLimiter,
        deriveLoginRateLimitKeys,
        LOGIN_RATE_LIMIT_ATTEMPTS,
        LOGIN_RATE_LIMIT_WINDOW_MS,
    },
    { loginRequestSchema },
    {
        createInitialRefreshTokenMaterial,
        getRefreshCookieOptions,
        hashRefreshToken,
        REFRESH_COOKIE_NAME,
        REFRESH_COOKIE_PATH,
    },
    {
        ACCESS_TOKEN_ALGORITHM,
        ACCESS_TOKEN_AUDIENCE,
        ACCESS_TOKEN_ISSUER,
        ACCESS_TOKEN_PROTECTED_TYPE,
        ACCESS_TOKEN_TYPE,
        createAccessToken,
    },
    { UserModel },
] = await Promise.all([
    import("../dist/shared/errors/app-error.js"),
    import("../dist/features/auth/login-rate-limit.service.js"),
    import("../dist/features/auth/login.schema.js"),
    import("../dist/features/auth/refresh-token.service.js"),
    import("../dist/features/auth/token.service.js"),
    import("../dist/features/users/user.model.js"),
]);

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("login validation normalizes identifiers but preserves password bytes", () => {
    const password = "  Canonical e\u0301 Password  ";
    const parsed = loginRequestSchema.parse({
        organisationSlug: "  Example-Org  ",
        email: "  Employee@Example.COM  ",
        password,
    });

    assert.deepEqual(parsed, {
        organisationSlug: "example-org",
        emailNormalized: "employee@example.com",
        password,
    });
});

test("login validation rejects empty, oversized, and unknown input", () => {
    assert.equal(
        loginRequestSchema.safeParse({
            organisationSlug: "example-org",
            email: "employee@example.com",
            password: "",
        }).success,
        false,
    );
    assert.equal(
        loginRequestSchema.safeParse({
            organisationSlug: "example-org",
            email: "employee@example.com",
            password: "😀".repeat(129),
        }).success,
        false,
    );
    assert.equal(
        loginRequestSchema.safeParse({
            orgId: randomUUID(),
            organisationSlug: "example-org",
            email: "employee@example.com",
            password: "short-is-valid-for-login",
        }).success,
        false,
    );
});

test("access token uses the approved protected header and canonical domain claims", async () => {
    const input = {
        userId: randomUUID(),
        orgId: randomUUID(),
        role: "TEAM_LEAD",
        permissions: [
            "chat:send",
            "team:view_logs",
            "admin:configure_policy",
        ],
        sessionId: randomUUID(),
    };
    const { accessToken, expiresInSeconds } =
        await createAccessToken(input);
    const protectedHeader = decodeProtectedHeader(accessToken);
    const secret = Buffer.from(
        authTestEnvironment.JWT_ACCESS_SECRET,
        "base64url",
    );
    const { payload } = await jwtVerify(accessToken, secret, {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
        audience: ACCESS_TOKEN_AUDIENCE,
        issuer: ACCESS_TOKEN_ISSUER,
        typ: ACCESS_TOKEN_PROTECTED_TYPE,
    });

    assert.deepEqual(protectedHeader, {
        alg: "HS256",
        typ: "at+jwt",
    });
    assert.equal(payload.sub, input.userId);
    assert.equal(payload.orgId, input.orgId);
    assert.equal(payload.role, "TEAM_LEAD");
    assert.deepEqual(payload.permissions, input.permissions);
    assert.equal(payload.sessionId, input.sessionId);
    assert.equal(payload.type, ACCESS_TOKEN_TYPE);
    assert.match(payload.jti, UUID_V4_PATTERN);
    assert.equal(payload.iss, "proxiai");
    assert.equal(payload.aud, "proxiai-api");
    assert.equal(payload.exp - payload.iat, 15 * 60);
    assert.equal(expiresInSeconds, 15 * 60);
    assert.equal("email" in payload, false);
});

test("access token copies Mongoose permission arrays into a plain JWT claim", async () => {
    const user = new UserModel({
        orgId: randomUUID(),
        email: "mongoose-array@example.com",
        passwordHash: "stored-hash",
        displayName: "Mongoose Array User",
        role: "EMPLOYEE",
        permissions: [
            "chat:send",
            "chat:view_own",
        ],
        status: "ACTIVE",
    });

    await user.validate();

    const { accessToken } = await createAccessToken({
        userId: user.userId,
        orgId: user.orgId,
        role: user.role,
        permissions: user.permissions,
        sessionId: randomUUID(),
    });
    const secret = Buffer.from(
        authTestEnvironment.JWT_ACCESS_SECRET,
        "base64url",
    );
    const { payload } = await jwtVerify(accessToken, secret, {
        algorithms: ["HS256"],
        audience: ACCESS_TOKEN_AUDIENCE,
        issuer: ACCESS_TOKEN_ISSUER,
        typ: ACCESS_TOKEN_PROTECTED_TYPE,
    });

    assert.deepEqual(payload.permissions, [
        "chat:send",
        "chat:view_own",
    ]);
});

test("initial refresh material uses separate UUIDs and persists only a hash shape", () => {
    const now = new Date("2026-07-28T00:00:00.000Z");
    const material = createInitialRefreshTokenMaterial(
        randomUUID(),
        randomUUID(),
        now,
    );

    for (const identifier of [
        material.tokenId,
        material.sessionId,
        material.familyId,
    ]) {
        assert.match(identifier, UUID_V4_PATTERN);
    }
    assert.equal(
        new Set([
            material.tokenId,
            material.sessionId,
            material.familyId,
        ]).size,
        3,
    );
    assert.equal(material.rawToken.length, 43);
    assert.match(material.tokenHash, /^[0-9a-f]{64}$/);
    assert.equal(
        material.tokenHash,
        hashRefreshToken(material.rawToken),
    );
    assert.equal(
        material.expiresAt.toISOString(),
        "2026-08-04T00:00:00.000Z",
    );
    assert.equal(material.tokenHash.includes(material.rawToken), false);
});

test("refresh cookie is host-only and uses the approved same-site boundary", () => {
    const options = getRefreshCookieOptions();

    assert.equal(REFRESH_COOKIE_NAME, "proxiai_refresh");
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, false);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, REFRESH_COOKIE_PATH);
    assert.equal(options.path, "/api/v1/auth");
    assert.equal(options.maxAge, 7 * 24 * 60 * 60 * 1_000);
    assert.equal("domain" in options, false);
});

test("rate-limit keys are deterministic, opaque, and separated by dimension", () => {
    const input = {
        ipAddress: "203.0.113.42",
        organisationSlug: "secret-tenant",
        emailNormalized: "person@example.com",
    };
    const first = deriveLoginRateLimitKeys(input);
    const second = deriveLoginRateLimitKeys(input);
    const serialized = JSON.stringify(first);

    assert.deepEqual(first, second);
    assert.notEqual(first.accountKey, first.ipKey);
    assert.equal(serialized.includes(input.ipAddress), false);
    assert.equal(serialized.includes(input.organisationSlug), false);
    assert.equal(serialized.includes(input.emailNormalized), false);
    assert.match(first.accountKey, /^rate:login:account:[0-9a-f]{64}$/);
    assert.match(first.ipKey, /^rate:login:ip:[0-9a-f]{64}$/);
});

test("rate limiter permits ten attempts and rejects the eleventh", async () => {
    const counts = new Map();
    const store = {
        async evaluate(_script, key, windowMs) {
            assert.equal(windowMs, LOGIN_RATE_LIMIT_WINDOW_MS);
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);

            return [count, windowMs];
        },
    };
    const limiter = createLoginRateLimiter(store);
    const input = {
        ipAddress: "127.0.0.1",
        organisationSlug: "example-org",
        emailNormalized: "employee@example.com",
    };

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT_ATTEMPTS; attempt += 1) {
        await limiter.consume(input);
    }

    await assert.rejects(
        limiter.consume(input),
        (error) => {
            assert.equal(error instanceof AppError, true);
            assert.equal(error.statusCode, 429);
            assert.equal(error.code, "RATE_LIMITED");
            assert.equal(error.details.retryAfterSeconds, 900);
            return true;
        },
    );
});

test("rate limiter fails closed when Redis evaluation is unavailable", async () => {
    const limiter = createLoginRateLimiter({
        async evaluate() {
            throw new Error("SENTINEL_REDIS_FAILURE");
        },
    });

    await assert.rejects(
        limiter.consume({
            ipAddress: "127.0.0.1",
            organisationSlug: "example-org",
            emailNormalized: "employee@example.com",
        }),
        (error) => {
            assert.equal(error instanceof AppError, true);
            assert.equal(error.statusCode, 503);
            assert.equal(error.code, "DEPENDENCY_UNAVAILABLE");
            assert.equal(
                String(error).includes("SENTINEL_REDIS_FAILURE"),
                false,
            );
            return true;
        },
    );
});
