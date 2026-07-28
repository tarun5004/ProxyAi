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
    process.env.LOGIN_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_login_test";
process.env.REDIS_URL =
    process.env.LOGIN_TEST_REDIS_URL
    ?? "redis://127.0.0.1:6379/15";

const mongoDatabaseName =
    new URL(process.env.MONGO_URI).pathname.slice(1);
const redisDatabaseNumber =
    Number(new URL(process.env.REDIS_URL).pathname.slice(1));

assert.match(
    mongoDatabaseName,
    /_test$/,
    "Login integration tests require a dedicated *_test Mongo database.",
);
assert.equal(
    redisDatabaseNumber,
    15,
    "Login integration tests require dedicated Redis database 15.",
);

const [
    mongooseModule,
    { app },
    { RefreshTokenModel },
    { OrganisationModel },
    { UserModel },
    { hashRefreshToken },
    { hashPassword },
    mongoModule,
    redisModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/app.js"),
    import("../dist/features/auth/refresh-token.model.js"),
    import("../dist/features/organisations/organisation.model.js"),
    import("../dist/features/users/user.model.js"),
    import("../dist/features/auth/refresh-token.service.js"),
    import("../dist/shared/security/password.js"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/shared/lib/redis.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { connectRedis, disconnectRedis, redis } = redisModule;
const CORRECT_PASSWORD = "Correct password 🔐";
const WRONG_PASSWORD = "Wrong password value";
let server;
let origin;

function organisationInput(overrides = {}) {
    const suffix = randomUUID();

    return {
        name: `Login Organisation ${suffix}`,
        slug: `login-${suffix}`,
        status: "ACTIVE",
        policy: {
            maskThreshold: 20,
            blockThreshold: 60,
        },
        ...overrides,
    };
}

async function createUser(
    organisation,
    overrides = {},
) {
    const email =
        overrides.email
        ?? `employee-${randomUUID()}@example.com`;
    const passwordHash =
        overrides.passwordHash
        ?? await hashPassword(CORRECT_PASSWORD);

    return UserModel.create({
        orgId: organisation.orgId,
        email,
        passwordHash,
        displayName: "Login Test User",
        role: "EMPLOYEE",
        permissions: [
            "chat:send",
            "chat:view_own",
        ],
        status: "ACTIVE",
        ...overrides,
    });
}

async function postLogin(body, additionalHeaders = {}) {
    return fetch(`${origin}/api/v1/auth/login`, {
        body: JSON.stringify(body),
        headers: {
            "Content-Type": "application/json",
            ...additionalHeaders,
        },
        method: "POST",
    });
}

function loginBody(organisation, user, password = CORRECT_PASSWORD) {
    return {
        organisationSlug: organisation.slug,
        email: user.email,
        password,
    };
}

test.before(async () => {
    await connectMongo();
    await connectRedis();
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
        redis.flushdb(),
    ]);
});

test.after(async () => {
    if (server?.listening) {
        server.close();
        await once(server, "close");
    }

    await Promise.all([
        mongoose.connection.dropDatabase(),
        redis.flushdb(),
    ]);
    await disconnectRedis();
    await disconnectMongo();
});

test("successful tenant login returns canonical JWT and persists only refresh hash", async () => {
    const organisation = await OrganisationModel.create(
        organisationInput(),
    );
    const user = await createUser(organisation, {
        email: "  Employee@Example.COM  ",
        role: "TEAM_LEAD",
        permissions: [
            "chat:send",
            "team:view_logs",
            "admin:configure_policy",
        ],
        teamId: randomUUID(),
    });

    const response = await postLogin({
        organisationSlug: `  ${organisation.slug.toUpperCase()}  `,
        email: "  EMPLOYEE@EXAMPLE.COM  ",
        password: CORRECT_PASSWORD,
    });
    const responseText = await response.text();
    const body = JSON.parse(responseText);
    const setCookie = response.headers.get("set-cookie");

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.user.userId, user.userId);
    assert.equal(body.data.user.organisation.orgId, organisation.orgId);
    assert.equal(body.data.user.role, "TEAM_LEAD");
    assert.deepEqual(body.data.user.permissions, [
        "chat:send",
        "team:view_logs",
        "admin:configure_policy",
    ]);
    assert.equal("refreshToken" in body.data, false);
    assert.equal(responseText.includes(CORRECT_PASSWORD), false);
    assert.notEqual(setCookie, null);
    assert.match(setCookie, /^proxiai_refresh=[^;]+/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\/api\/v1\/auth/i);
    assert.equal(/;\s*Domain=/i.test(setCookie), false);
    assert.equal(/;\s*Secure/i.test(setCookie), false);

    const rawRefreshToken =
        /^proxiai_refresh=([^;]+)/.exec(setCookie)?.[1];
    assert.notEqual(rawRefreshToken, undefined);

    const secret = Buffer.from(
        authTestEnvironment.JWT_ACCESS_SECRET,
        "base64url",
    );
    const { payload, protectedHeader } = await jwtVerify(
        body.data.accessToken,
        secret,
        {
            algorithms: ["HS256"],
            audience: "proxiai-api",
            issuer: "proxiai",
            typ: "at+jwt",
        },
    );

    assert.equal(protectedHeader.alg, "HS256");
    assert.equal(protectedHeader.typ, "at+jwt");
    assert.equal(payload.sub, user.userId);
    assert.equal(payload.orgId, organisation.orgId);
    assert.equal(payload.role, "TEAM_LEAD");
    assert.deepEqual(payload.permissions, [
        "chat:send",
        "team:view_logs",
        "admin:configure_policy",
    ]);
    assert.equal(payload.type, "access");

    const persistedToken =
        await mongoose.connection.collection("refresh_tokens")
            .findOne({
                orgId: organisation.orgId,
                userId: user.userId,
            });

    assert.notEqual(persistedToken, null);
    assert.equal(
        persistedToken.tokenHash,
        hashRefreshToken(rawRefreshToken),
    );
    assert.equal(
        new Set([
            persistedToken.tokenId,
            persistedToken.sessionId,
            persistedToken.familyId,
        ]).size,
        3,
    );
    assert.equal(
        JSON.stringify(persistedToken).includes(rawRefreshToken),
        false,
    );
    assert.equal(payload.sessionId, persistedToken.sessionId);
    assert.equal(persistedToken.createdAt instanceof Date, true);
    assert.equal(persistedToken.updatedAt instanceof Date, true);

    const updatedUser = await UserModel.findOne({
        orgId: organisation.orgId,
        userId: user.userId,
    })
        .select("+failedLoginCount")
        .orFail();

    assert.equal(updatedUser.failedLoginCount, 0);
    assert.equal(updatedUser.lastLoginAt instanceof Date, true);
});

test("tenant and credential failures expose one identical public error", async () => {
    const activeOrganisation = await OrganisationModel.create(
        organisationInput(),
    );
    const suspendedOrganisation = await OrganisationModel.create(
        organisationInput({
            status: "SUSPENDED",
        }),
    );
    const activeUser = await createUser(activeOrganisation, {
        email: "active@example.com",
    });
    const disabledUser = await createUser(activeOrganisation, {
        email: "disabled@example.com",
        status: "DISABLED",
    });
    const failures = [
        {
            organisationSlug: `missing-${randomUUID()}`,
            email: activeUser.email,
            password: WRONG_PASSWORD,
        },
        loginBody(suspendedOrganisation, activeUser, WRONG_PASSWORD),
        {
            organisationSlug: activeOrganisation.slug,
            email: "missing@example.com",
            password: WRONG_PASSWORD,
        },
        loginBody(activeOrganisation, disabledUser, CORRECT_PASSWORD),
        loginBody(activeOrganisation, activeUser, WRONG_PASSWORD),
    ];
    const publicFailures = [];

    for (const body of failures) {
        const response = await postLogin(body);
        const responseBody = await response.json();

        assert.equal(response.status, 401);
        assert.equal(response.headers.get("set-cookie"), null);
        publicFailures.push({
            code: responseBody.error.code,
            message: responseBody.error.message,
        });
    }

    assert.equal(
        new Set(publicFailures.map(JSON.stringify)).size,
        1,
    );
    assert.deepEqual(publicFailures[0], {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
    });
    assert.equal(await RefreshTokenModel.countDocuments({}), 0);

    const [updatedActive, updatedDisabled] = await Promise.all([
        UserModel.findOne({
            orgId: activeOrganisation.orgId,
            userId: activeUser.userId,
        })
            .select("+failedLoginCount")
            .orFail(),
        UserModel.findOne({
            orgId: activeOrganisation.orgId,
            userId: disabledUser.userId,
        })
            .select("+failedLoginCount")
            .orFail(),
    ]);

    assert.equal(updatedActive.failedLoginCount, 1);
    assert.equal(updatedDisabled.failedLoginCount, 1);
});

test("same normalized email resolves only inside the slug-derived organisation", async () => {
    const [organisationA, organisationB] = await Promise.all([
        OrganisationModel.create(organisationInput()),
        OrganisationModel.create(organisationInput()),
    ]);
    const sharedEmail = "shared@example.com";
    const [userA, userB] = await Promise.all([
        createUser(organisationA, {
            email: sharedEmail,
        }),
        createUser(organisationB, {
            email: sharedEmail,
            displayName: "Other Tenant User",
        }),
    ]);

    const response = await postLogin(
        loginBody(organisationB, userB),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.user.userId, userB.userId);
    assert.notEqual(body.data.user.userId, userA.userId);
    assert.equal(
        body.data.user.organisation.orgId,
        organisationB.orgId,
    );
});

test("real Redis enforces opaque IP and account limits at ten attempts", async () => {
    const organisation = await OrganisationModel.create(
        organisationInput(),
    );
    const user = await createUser(organisation, {
        email: "rate-limited@example.com",
    });
    const requestBody = loginBody(
        organisation,
        user,
        WRONG_PASSWORD,
    );

    for (let attempt = 1; attempt <= 10; attempt += 1) {
        const response = await postLogin(requestBody, {
            "X-Forwarded-For": `203.0.113.${attempt}`,
        });
        assert.equal(response.status, 401);
    }

    const rejectedResponse = await postLogin(requestBody, {
        "X-Forwarded-For": "203.0.113.250",
    });
    const rejectedBody = await rejectedResponse.json();

    assert.equal(rejectedResponse.status, 429);
    assert.equal(rejectedBody.error.code, "RATE_LIMITED");
    assert.equal(rejectedResponse.headers.get("set-cookie"), null);

    const keys = await redis.keys("rate:login:*");
    const serializedKeys = JSON.stringify(keys);

    assert.equal(keys.length, 2);
    assert.equal(serializedKeys.includes(organisation.slug), false);
    assert.equal(serializedKeys.includes(user.emailNormalized), false);
    assert.equal(serializedKeys.includes("127.0.0.1"), false);

    for (const key of keys) {
        const [count, ttl] = await Promise.all([
            redis.get(key),
            redis.pttl(key),
        ]);

        assert.equal(Number(count), 11);
        assert.equal(ttl > 0 && ttl <= 15 * 60 * 1_000, true);
    }
});
