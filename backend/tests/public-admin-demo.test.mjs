import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { decodeJwt, SignJWT } from "jose";

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
    { createDemoAdminHandler },
    { createDemoAdminService },
    {
        createPublicAdminDemoAccessToken,
        PUBLIC_ADMIN_DEMO_TTL_SECONDS,
        verifyAccessToken,
    },
    { rejectPublicDemoAdminMutation },
    {
        DEMO_ORGANISATION,
        DEMO_PRIVATE_ADMIN,
    },
    { USER_PERMISSIONS_BY_ROLE },
] = await Promise.all([
    import("../dist/features/auth/demo-admin.controller.js"),
    import("../dist/features/auth/demo-admin.service.js"),
    import("../dist/features/auth/token.service.js"),
    import("../dist/features/auth/authorization.middleware.js"),
    import("../dist/shared/demo/demo-identities.js"),
    import("../dist/features/users/user.types.js"),
]);

const orgId = randomUUID();
const userId = randomUUID();
const sessionId = randomUUID();

test("public demo service resolves only the fixed active admin identity", async () => {
    const lookups = [];
    const service = createDemoAdminService({
        async appendAudit() {},
        async createAccessToken(input) {
            assert.equal(input.orgId, orgId);
            assert.equal(input.userId, userId);
            assert.deepEqual(
                input.permissions,
                USER_PERMISSIONS_BY_ROLE.ORG_ADMIN,
            );
            return {
                accessToken: "opaque-access-token",
                expiresAt: "2026-08-22T12:06:00.000Z",
                expiresInSeconds: PUBLIC_ADMIN_DEMO_TTL_SECONDS,
            };
        },
        async findOrganisation(slug) {
            lookups.push(["organisation", slug]);
            return {
                orgId,
                name: "NovaStack Technologies",
                plan: "FREE",
                retention: { mode: "METADATA_ONLY" },
                status: "ACTIVE",
            };
        },
        async findUser(trustedOrgId, emailNormalized) {
            lookups.push(["user", trustedOrgId, emailNormalized]);
            return {
                userId,
                orgId,
                email: DEMO_PRIVATE_ADMIN.email,
                displayName: DEMO_PRIVATE_ADMIN.displayName,
                role: "ORG_ADMIN",
                permissions: [...USER_PERMISSIONS_BY_ROLE.ORG_ADMIN],
                status: "ACTIVE",
            };
        },
        randomUUID() {
            return sessionId;
        },
    });

    const result = await service.start(
        { error() {}, info() {}, warn() {} },
        "request-public-demo",
    );

    assert.deepEqual(lookups, [
        ["organisation", DEMO_ORGANISATION.slug],
        ["user", orgId, DEMO_PRIVATE_ADMIN.email],
    ]);
    assert.equal(result.user.role, "ORG_ADMIN");
    assert.deepEqual(
        result.user.permissions,
        USER_PERMISSIONS_BY_ROLE.ORG_ADMIN,
    );
    assert.equal(JSON.stringify(result).includes("password"), false);
});

test("public demo token is marked, expires within six minutes, and expires normally", async () => {
    const createdAtMs = Date.now();
    const result = await createPublicAdminDemoAccessToken({
        userId,
        orgId,
        role: "ORG_ADMIN",
        permissions: [...USER_PERMISSIONS_BY_ROLE.ORG_ADMIN],
        sessionId,
    });
    const payload = decodeJwt(result.accessToken);

    assert.equal(payload.sessionMode, "PUBLIC_ADMIN_DEMO");
    assert.equal(payload.exp - payload.iat, PUBLIC_ADMIN_DEMO_TTL_SECONDS);
    assert.equal(result.expiresInSeconds, PUBLIC_ADMIN_DEMO_TTL_SECONDS);
    assert.ok(Date.parse(result.expiresAt) - createdAtMs <= 361_000);
    assert.equal(
        (await verifyAccessToken(result.accessToken))?.sessionMode,
        "PUBLIC_ADMIN_DEMO",
    );

    const now = Math.floor(Date.now() / 1_000);
    const expiredToken = await new SignJWT({
        orgId,
        permissions: [...USER_PERMISSIONS_BY_ROLE.ORG_ADMIN],
        role: "ORG_ADMIN",
        sessionId,
        sessionMode: "PUBLIC_ADMIN_DEMO",
        type: "access",
    })
        .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
        .setSubject(userId)
        .setJti(randomUUID())
        .setIssuedAt(now - 361)
        .setExpirationTime(now - 1)
        .setIssuer("proxiai")
        .setAudience("proxiai-api")
        .sign(Buffer.from(
            authTestEnvironment.JWT_ACCESS_SECRET,
            "base64url",
        ));

    assert.equal(await verifyAccessToken(expiredToken), null);
});

test("public demo controller rejects client input and never creates refresh state", async () => {
    let serviceCalls = 0;
    let limiterCalls = 0;
    const disabledHandler = createDemoAdminHandler({
        enabled: false,
        rateLimiter: { async consume() { limiterCalls += 1; } },
        service: { async start() { serviceCalls += 1; } },
    });

    await assert.rejects(
        disabledHandler({ body: {} }, {}),
        (error) => error.statusCode === 404 && error.code === "NOT_FOUND",
    );
    assert.equal(limiterCalls, 0);
    assert.equal(serviceCalls, 0);

    const handler = createDemoAdminHandler({
        enabled: true,
        rateLimiter: {
            async consume() {
                limiterCalls += 1;
            },
        },
        service: {
            async start() {
                serviceCalls += 1;
                return {
                    accessToken: "opaque-access-token",
                    expiresAt: "2026-08-22T12:06:00.000Z",
                    expiresInSeconds: PUBLIC_ADMIN_DEMO_TTL_SECONDS,
                    user: { role: "ORG_ADMIN" },
                };
            },
        },
    });

    await assert.rejects(
        handler({ body: { email: "attacker@example.com" } }, {}),
        (error) => error.statusCode === 400
            && error.code === "VALIDATION_ERROR",
    );
    assert.equal(limiterCalls, 0);
    assert.equal(serviceCalls, 0);

    let responseBody;
    const clearedCookies = [];
    await handler(
        {
            body: {},
            ip: "127.0.0.1",
            log: { error() {}, info() {}, warn() {} },
            requestId: "request-public-demo",
            socket: {},
        },
        {
            clearCookie(name) {
                clearedCookies.push(name);
            },
            json(value) {
                responseBody = value;
            },
            setHeader() {},
            status() {
                return this;
            },
        },
    );

    assert.equal(serviceCalls, 1);
    assert.deepEqual(clearedCookies, ["proxiai_refresh"]);
    assert.equal("refreshToken" in responseBody.data, false);
});

test("public demo admin mutations are denied while standard sessions remain unchanged", () => {
    let publicError;
    rejectPublicDemoAdminMutation(
        { auth: { sessionMode: "PUBLIC_ADMIN_DEMO" } },
        {},
        (error) => {
            publicError = error;
        },
    );

    assert.equal(publicError.statusCode, 403);
    assert.equal(publicError.code, "PUBLIC_DEMO_READ_ONLY");

    let standardError = "not-called";
    rejectPublicDemoAdminMutation(
        { auth: { sessionMode: "STANDARD" } },
        {},
        (error) => {
            standardError = error;
        },
    );
    assert.equal(standardError, undefined);
    assert.deepEqual(USER_PERMISSIONS_BY_ROLE.EMPLOYEE, [
        "chat:send",
        "chat:view_own",
    ]);
});
