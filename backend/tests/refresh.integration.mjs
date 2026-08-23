import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { jwtVerify } from "jose";

import {
    applyAuthTestEnvironment,
    authTestEnvironment,
} from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "warn";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI =
    process.env.REFRESH_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_refresh_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const mongoDatabaseName =
    new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    mongoDatabaseName,
    /_test$/,
    "Refresh integration tests require a dedicated *_test Mongo database.",
);

const [
    mongooseModule,
    { app },
    { RefreshTokenModel },
    { OrganisationModel },
    { UserModel },
    {
        createInitialRefreshTokenMaterial,
        hashRefreshToken,
        persistInitialRefreshToken,
        REFRESH_COOKIE_NAME,
    },
    { hashPassword },
    mongoModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/app.js"),
    import("../dist/features/auth/refresh-token.model.js"),
    import("../dist/features/organisations/organisation.model.js"),
    import("../dist/features/users/user.model.js"),
    import("../dist/features/auth/refresh-token.service.js"),
    import("../dist/shared/security/password.js"),
    import("../dist/shared/lib/mongo.js"),
]);

const { markApiRuntimeReady } = await import(
    "../dist/shared/runtime/api-runtime-state.js"
);
markApiRuntimeReady();

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const PASSWORD = "Valid refresh password";
let server;
let origin;

function organisationInput(overrides = {}) {
    const suffix = randomUUID();

    return {
        name: `Refresh Organisation ${suffix}`,
        slug: `refresh-${suffix}`,
        status: "ACTIVE",
        policy: {
            maskThreshold: 20,
            blockThreshold: 60,
        },
        ...overrides,
    };
}

async function createUser(organisation, overrides = {}) {
    return UserModel.create({
        orgId: organisation.orgId,
        email: `refresh-${randomUUID()}@example.com`,
        passwordHash: await hashPassword(PASSWORD),
        displayName: "Refresh Test User",
        role: "EMPLOYEE",
        permissions: ["chat:send", "chat:view_own"],
        status: "ACTIVE",
        ...overrides,
    });
}

async function createPersistedRefreshToken(
    organisation,
    user,
    overrides = {},
) {
    const material = createInitialRefreshTokenMaterial(
        organisation.orgId,
        user.userId,
    );

    await RefreshTokenModel.create({
        tokenId: material.tokenId,
        sessionId: material.sessionId,
        familyId: material.familyId,
        orgId: material.orgId,
        userId: material.userId,
        tokenHash: material.tokenHash,
        expiresAt: material.expiresAt,
        ...overrides,
    });

    return material;
}

async function postRefresh(rawRefreshToken) {
    return fetch(`${origin}/api/v1/auth/refresh`, {
        headers:
            rawRefreshToken === undefined
                ? {}
                : {
                    Cookie: `${REFRESH_COOKIE_NAME}=${rawRefreshToken}`,
                },
        method: "POST",
    });
}

function extractRefreshCookie(setCookie) {
    return new RegExp(`${REFRESH_COOKIE_NAME}=([^;]*)`).exec(
        setCookie,
    )?.[1];
}

async function assertGenericRefreshFailure(response) {
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.deepEqual(
        {
            code: body.error.code,
            message: body.error.message,
        },
        {
            code: "INVALID_REFRESH_TOKEN",
            message: "Session is invalid or expired.",
        },
    );
}

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        OrganisationModel.init(),
        UserModel.init(),
        RefreshTokenModel.init(),
    ]);

    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    origin = `http://127.0.0.1:${address.port}`;
});

test.beforeEach(async () => {
    await Promise.all([
        OrganisationModel.deleteMany({}),
        UserModel.deleteMany({}),
        RefreshTokenModel.deleteMany({}),
    ]);
});

test.after(async () => {
    if (server?.listening) {
        server.close();
        await once(server, "close");
    }

    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("valid refresh rotates cookie and returns JWT with current user state", async () => {
    const organisation = await OrganisationModel.create(
        organisationInput(),
    );
    const user = await createUser(organisation);
    const initialMaterial = await createPersistedRefreshToken(
        organisation,
        user,
    );

    await UserModel.updateOne(
        {
            orgId: organisation.orgId,
            userId: user.userId,
        },
        {
            $set: {
                permissions: [
                    "admin:view_logs",
                    "admin:manage_users",
                ],
                role: "ORG_ADMIN",
            },
        },
        {
            runValidators: true,
        },
    );

    const response = await postRefresh(initialMaterial.rawToken);
    const responseText = await response.text();
    const body = JSON.parse(responseText);
    const setCookie = response.headers.get("set-cookie");
    const replacementRawToken = extractRefreshCookie(setCookie);

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal("refreshToken" in body.data, false);
    assert.notEqual(setCookie, null);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\/api\/v1\/auth/i);
    assert.notEqual(replacementRawToken, undefined);
    assert.notEqual(replacementRawToken, initialMaterial.rawToken);
    assert.equal(responseText.includes(replacementRawToken), false);

    const oldToken = await RefreshTokenModel.findOne({
        tokenId: initialMaterial.tokenId,
    }).orFail();
    const replacementToken =
        await mongoose.connection.collection("refresh_tokens")
            .findOne({
                tokenHash: hashRefreshToken(replacementRawToken),
            });

    assert.equal(oldToken.usedAt instanceof Date, true);
    assert.notEqual(replacementToken, null);
    assert.equal(oldToken.replacedByTokenId, replacementToken.tokenId);
    assert.equal(replacementToken.orgId, initialMaterial.orgId);
    assert.equal(replacementToken.userId, initialMaterial.userId);
    assert.equal(replacementToken.sessionId, initialMaterial.sessionId);
    assert.equal(replacementToken.familyId, initialMaterial.familyId);
    assert.notEqual(replacementToken.tokenId, initialMaterial.tokenId);

    const persistedTokens =
        await mongoose.connection.collection("refresh_tokens")
            .find({})
            .toArray();
    const persistedJson = JSON.stringify(persistedTokens);

    assert.equal(persistedJson.includes(initialMaterial.rawToken), false);
    assert.equal(persistedJson.includes(replacementRawToken), false);

    const secret = Buffer.from(
        authTestEnvironment.JWT_ACCESS_SECRET,
        "base64url",
    );
    const { payload } = await jwtVerify(
        body.data.accessToken,
        secret,
        {
            algorithms: ["HS256"],
            audience: "proxiai-api",
            issuer: "proxiai",
            typ: "at+jwt",
        },
    );

    assert.equal(payload.sub, user.userId);
    assert.equal(payload.orgId, organisation.orgId);
    assert.equal(payload.role, "ORG_ADMIN");
    assert.deepEqual(payload.permissions, [
        "admin:view_logs",
        "admin:manage_users",
    ]);
    assert.equal(payload.sessionId, initialMaterial.sessionId);
    assert.equal(payload.type, "access");
});

test("refresh failures return the same generic public error", async () => {
    const activeOrganisation = await OrganisationModel.create(
        organisationInput(),
    );
    const suspendedOrganisation = await OrganisationModel.create(
        organisationInput({ status: "SUSPENDED" }),
    );
    const activeUser = await createUser(activeOrganisation);
    const disabledUser = await createUser(activeOrganisation, {
        email: `disabled-${randomUUID()}@example.com`,
        status: "DISABLED",
    });
    const expiredToken = await createPersistedRefreshToken(
        activeOrganisation,
        activeUser,
        {
            expiresAt: new Date(Date.now() - 60_000),
        },
    );
    const revokedToken = await createPersistedRefreshToken(
        activeOrganisation,
        activeUser,
        {
            revokedAt: new Date(),
        },
    );
    const disabledUserToken = await createPersistedRefreshToken(
        activeOrganisation,
        disabledUser,
    );
    const suspendedOrgUser = await createUser(suspendedOrganisation, {
        email: `suspended-${randomUUID()}@example.com`,
    });
    const suspendedOrgToken = await createPersistedRefreshToken(
        suspendedOrganisation,
        suspendedOrgUser,
    );
    const anonymousResponse = await postRefresh(undefined);

    assert.equal(anonymousResponse.status, 204);
    assert.equal(await anonymousResponse.text(), "");
    assert.match(
        anonymousResponse.headers.get("set-cookie") ?? "",
        /proxiai_refresh=;/,
    );

    const responses = await Promise.all([
        postRefresh("unknown-refresh-token"),
        postRefresh(expiredToken.rawToken),
        postRefresh(revokedToken.rawToken),
        postRefresh(disabledUserToken.rawToken),
        postRefresh(suspendedOrgToken.rawToken),
    ]);
    const publicFailures = [];

    for (const response of responses) {
        const body = await response.json();

        assert.equal(response.status, 401);
        publicFailures.push({
            code: body.error.code,
            message: body.error.message,
        });
        assert.match(
            response.headers.get("set-cookie") ?? "",
            /proxiai_refresh=;/,
        );
    }

    assert.equal(
        new Set(publicFailures.map(JSON.stringify)).size,
        1,
    );
    assert.deepEqual(publicFailures[0], {
        code: "INVALID_REFRESH_TOKEN",
        message: "Session is invalid or expired.",
    });
});

test("reused refresh token revokes the complete existing family", async () => {
    const organisation = await OrganisationModel.create(
        organisationInput(),
    );
    const user = await createUser(organisation);
    const usedMaterial = await createPersistedRefreshToken(
        organisation,
        user,
        {
            usedAt: new Date(),
        },
    );
    const activeSibling = createInitialRefreshTokenMaterial(
        organisation.orgId,
        user.userId,
    );

    await RefreshTokenModel.create({
        tokenId: activeSibling.tokenId,
        sessionId: usedMaterial.sessionId,
        familyId: usedMaterial.familyId,
        orgId: usedMaterial.orgId,
        userId: usedMaterial.userId,
        tokenHash: activeSibling.tokenHash,
        expiresAt: activeSibling.expiresAt,
    });

    const response = await postRefresh(usedMaterial.rawToken);

    await assertGenericRefreshFailure(response);
    assert.match(
        response.headers.get("set-cookie") ?? "",
        /proxiai_refresh=;/,
    );

    const familyTokens = await RefreshTokenModel.find({
        familyId: usedMaterial.familyId,
        orgId: usedMaterial.orgId,
        sessionId: usedMaterial.sessionId,
        userId: usedMaterial.userId,
    });

    assert.equal(familyTokens.length, 2);
    assert.equal(
        familyTokens.every((token) => token.revokedAt instanceof Date),
        true,
    );
});

test("concurrent refresh attempts preserve a usable winning rotation", async () => {
    const organisation = await OrganisationModel.create(
        organisationInput(),
    );
    const user = await createUser(organisation);
    const initialMaterial = await createPersistedRefreshToken(
        organisation,
        user,
    );

    const responses = await Promise.all([
        postRefresh(initialMaterial.rawToken),
        postRefresh(initialMaterial.rawToken),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    assert.deepEqual(statuses, [200, 401]);

    const oldToken = await RefreshTokenModel.findOne({
        tokenId: initialMaterial.tokenId,
    }).orFail();
    const familyTokens = await RefreshTokenModel.find({
        familyId: initialMaterial.familyId,
        orgId: initialMaterial.orgId,
        sessionId: initialMaterial.sessionId,
        userId: initialMaterial.userId,
    });

    assert.equal(oldToken.usedAt instanceof Date, true);
    assert.equal(familyTokens.length >= 1, true);
    assert.equal(
        familyTokens.filter(
            (token) => token.tokenId !== initialMaterial.tokenId,
        ).length <= 1,
        true,
    );

    const successfulResponse = responses.find(
        (response) => response.status === 200,
    );
    const replacementCookie = successfulResponse?.headers
        .get("set-cookie")
        ?.match(/proxiai_refresh=([^;]+)/)?.[1];

    assert.ok(replacementCookie);
    const followUpResponse = await postRefresh(replacementCookie);
    assert.equal(followUpResponse.status, 200);
});
