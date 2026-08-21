import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { SignJWT } from "jose";

import {
    applyAuthTestEnvironment,
    authTestEnvironment,
} from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI = process.env.PHASE11_AUTH_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_phase11_auth_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);
assert.match(databaseName, /_test$/, "Auth/RBAC tests require a dedicated *_test database.");

const [
    mongooseModule,
    mongoModule,
    { app },
    { createAccessToken },
    { hashRefreshToken },
    { RefreshTokenModel },
    { OrganisationModel },
    { UserModel },
    { USER_PERMISSIONS_BY_ROLE },
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/app.js"),
    import("../dist/features/auth/token.service.js"),
    import("../dist/features/auth/refresh-token.service.js"),
    import("../dist/features/auth/refresh-token.model.js"),
    import("../dist/features/organisations/organisation.model.js"),
    import("../dist/features/users/user.model.js"),
    import("../dist/features/users/user.types.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
});
const address = server.address();
assert.notEqual(address, null);
assert.equal(typeof address, "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

let transactionsAvailable = false;

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsAvailable = typeof hello.setName === "string" || hello.msg === "isdbgrid";
    await Promise.all([
        OrganisationModel.init(),
        RefreshTokenModel.init(),
        UserModel.init(),
    ]);
});

test.beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([
        OrganisationModel.createIndexes(),
        RefreshTokenModel.createIndexes(),
        UserModel.createIndexes(),
    ]);
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
    await new Promise((resolve, reject) => server.close((error) => {
        if (error) reject(error);
        else resolve();
    }));
});

test("authentication rejects missing, malformed, expired, and inactive principals generically", async () => {
    const fixture = await createFixture();
    const validToken = await tokenFor(fixture.employee);
    const cases = [
        {},
        { authorization: "Bearer malformed" },
        { authorization: `Bearer ${await expiredTokenFor(fixture.employee)}` },
    ];

    for (const headers of cases) {
        await assertError(await request("/api/v1/auth/me", { headers }), 401, "UNAUTHORIZED");
    }

    await UserModel.updateOne(
        { orgId: fixture.orgId, userId: fixture.employee.userId },
        { $set: { status: "DISABLED" } },
    );
    await assertError(
        await request("/api/v1/auth/me", { headers: bearer(validToken) }),
        401,
        "UNAUTHORIZED",
    );

    await UserModel.updateOne(
        { orgId: fixture.orgId, userId: fixture.employee.userId },
        { $set: { status: "ACTIVE" } },
    );
    await OrganisationModel.updateOne(
        { orgId: fixture.orgId },
        { $set: { status: "SUSPENDED" } },
    );
    await assertError(
        await request("/api/v1/auth/me", { headers: bearer(validToken) }),
        401,
        "UNAUTHORIZED",
    );
});

test("current database role and permissions override stale or escalated JWT snapshots", async () => {
    const fixture = await createFixture();
    const staleEmployeeToken = await tokenFor(fixture.employee);
    const forgedAdminSnapshot = await createAccessToken({
        orgId: fixture.orgId,
        userId: fixture.employee.userId,
        role: "ORG_ADMIN",
        permissions: [...USER_PERMISSIONS_BY_ROLE.ORG_ADMIN],
        sessionId: randomUUID(),
    });

    await assertError(
        await request("/api/v1/admin/users", { headers: bearer(forgedAdminSnapshot.accessToken) }),
        403,
        "FORBIDDEN",
    );

    await UserModel.updateOne(
        { orgId: fixture.orgId, userId: fixture.employee.userId },
        {
            $set: {
                role: "ORG_ADMIN",
                permissions: [...USER_PERMISSIONS_BY_ROLE.ORG_ADMIN],
            },
        },
        { runValidators: true },
    );

    const response = await request("/api/v1/admin/users", {
        headers: bearer(staleEmployeeToken),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.items.length, 3);
    assert.equal(body.data.items.some((user) => "passwordHash" in user), false);
});

test("every Phase 8 and 9 admin route enforces canonical role permissions at runtime", async () => {
    const fixture = await createFixture();
    const deniedTokens = [
        await tokenFor(fixture.employee),
        await tokenFor(fixture.teamLead),
    ];
    const guardedRequests = adminRequests();

    for (const accessToken of deniedTokens) {
        for (const input of guardedRequests) {
            await assertError(
                await request(input.path, { ...input.options, headers: bearer(accessToken) }),
                403,
                "FORBIDDEN",
            );
        }
    }

    const adminToken = await tokenFor(fixture.admin);
    for (const input of guardedRequests) {
        const response = await request(input.path, {
            ...input.options,
            headers: bearer(adminToken),
        });
        assert.notEqual(response.status, 401, `${input.options.method ?? "GET"} ${input.path}`);
        assert.notEqual(response.status, 403, `${input.options.method ?? "GET"} ${input.path}`);
    }
});

test("foreign admin resource identifiers return generic not found without mutation", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createFixture();
    const adminToken = await tokenFor(fixture.admin);
    const foreignBefore = await UserModel.findOne({
        orgId: fixture.foreignOrgId,
        userId: fixture.foreignUserId,
    }).lean();

    await assertError(
        await request(`/api/v1/admin/users/${fixture.foreignUserId}/role`, {
            method: "PATCH",
            headers: bearer(adminToken),
            body: JSON.stringify({ role: "ORG_ADMIN" }),
        }),
        404,
        "NOT_FOUND",
    );

    const foreignAfter = await UserModel.findOne({
        orgId: fixture.foreignOrgId,
        userId: fixture.foreignUserId,
    }).lean();
    assert.equal(foreignAfter?.role, foreignBefore?.role);
    assert.deepEqual(foreignAfter?.permissions, foreignBefore?.permissions);
});

test("logout revokes the refresh family idempotently while access JWT follows its bounded lifetime", async () => {
    const fixture = await createFixture();
    const rawRefreshToken = "phase11_logout_raw_token_sentinel";
    const sessionId = randomUUID();
    const familyId = randomUUID();
    await RefreshTokenModel.create({
        tokenId: randomUUID(),
        sessionId,
        familyId,
        orgId: fixture.orgId,
        userId: fixture.employee.userId,
        tokenHash: hashRefreshToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + 60_000),
    });
    const accessToken = await tokenFor(fixture.employee, sessionId);

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await request("/api/v1/auth/logout", {
            method: "POST",
            headers: { cookie: `proxiai_refresh=${rawRefreshToken}` },
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.data.loggedOut, true);
        assert.match(response.headers.get("set-cookie") ?? "", /proxiai_refresh=;/);
    }

    const token = await RefreshTokenModel.findOne({
        orgId: fixture.orgId,
        familyId,
        sessionId,
    }).lean();
    assert.ok(token?.revokedAt instanceof Date);

    const meResponse = await request("/api/v1/auth/me", {
        headers: bearer(accessToken),
    });
    assert.equal(meResponse.status, 200);
});

async function createFixture() {
    const orgId = randomUUID();
    const foreignOrgId = randomUUID();
    await OrganisationModel.create([
        organisation(orgId, "phase11-auth"),
        organisation(foreignOrgId, "phase11-foreign"),
    ]);
    const employee = user(orgId, "EMPLOYEE");
    const teamLead = user(orgId, "TEAM_LEAD", randomUUID());
    const admin = user(orgId, "ORG_ADMIN");
    const foreign = user(foreignOrgId, "EMPLOYEE");
    await UserModel.create([employee, teamLead, admin, foreign]);

    return {
        orgId,
        foreignOrgId,
        employee,
        teamLead,
        admin,
        foreignUserId: foreign.userId,
    };
}

function organisation(orgId, slugPrefix) {
    return {
        orgId,
        name: slugPrefix,
        slug: `${slugPrefix}-${orgId.slice(0, 8)}`,
        status: "ACTIVE",
        monthlyTokenBudget: 10_000,
        policy: { maskThreshold: 20, blockThreshold: 60 },
    };
}

function user(orgId, role, teamId) {
    const userId = randomUUID();
    return {
        orgId,
        userId,
        email: `${userId}@example.test`,
        passwordHash: "stored-hash",
        displayName: `${role} User`,
        role,
        permissions: [...USER_PERMISSIONS_BY_ROLE[role]],
        ...(teamId === undefined ? {} : { teamId }),
        status: "ACTIVE",
    };
}

async function tokenFor(userRecord, sessionId = randomUUID()) {
    const result = await createAccessToken({
        orgId: userRecord.orgId,
        userId: userRecord.userId,
        role: userRecord.role,
        permissions: [...userRecord.permissions],
        sessionId,
    });
    return result.accessToken;
}

async function expiredTokenFor(userRecord) {
    const now = Math.floor(Date.now() / 1_000);
    return new SignJWT({
        orgId: userRecord.orgId,
        permissions: [...userRecord.permissions],
        role: userRecord.role,
        sessionId: randomUUID(),
        type: "access",
    })
        .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
        .setSubject(userRecord.userId)
        .setJti(randomUUID())
        .setIssuedAt(now - 120)
        .setExpirationTime(now - 60)
        .setIssuer("proxiai")
        .setAudience("proxiai-api")
        .sign(Buffer.from(authTestEnvironment.JWT_ACCESS_SECRET, "base64url"));
}

function adminRequests() {
    const jsonHeaders = { "content-type": "application/json" };
    return [
        { path: "/api/v1/admin/summary?period=invalid", options: {} },
        { path: "/api/v1/admin/logs?limit=0", options: {} },
        { path: "/api/v1/admin/billing?period=invalid", options: {} },
        { path: "/api/v1/admin/alerts?limit=0", options: {} },
        { path: "/api/v1/admin/users", options: {} },
        { path: "/api/v1/admin/teams?limit=0", options: {} },
        { path: "/api/v1/admin/users/not-a-uuid/role", options: { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ role: "ORG_ADMIN" }) } },
        { path: "/api/v1/admin/users/not-a-uuid/team", options: { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ teamId: null }) } },
        { path: "/api/v1/admin/users/not-a-uuid/status", options: { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ status: "DISABLED" }) } },
        { path: "/api/v1/admin/users/not-a-uuid/revoke-sessions", options: { method: "POST", headers: jsonHeaders, body: "{}" } },
        { path: "/api/v1/admin/policy", options: { method: "PATCH", headers: jsonHeaders, body: "{}" } },
        { path: "/api/v1/admin/retention", options: { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ mode: "INVALID" }) } },
        { path: "/api/v1/admin/alerts/not-a-uuid", options: { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ resolved: true }) } },
        { path: "/api/v1/admin/audit/export", options: {} },
    ];
}

function bearer(accessToken) {
    return { authorization: `Bearer ${accessToken}` };
}

async function request(path, options = {}) {
    return fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            ...(options.headers ?? {}),
        },
    });
}

async function assertError(response, status, code) {
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.requestId, "string");
}
