import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [{ createAuthService }, { AppError }] = await Promise.all([
    import("../dist/features/auth/auth.service.js"),
    import("../dist/shared/errors/app-error.js"),
]);

const SENTINELS = {
    accessToken: "SENTINEL_ACCESS_TOKEN",
    email: "person@example.com",
    password: "SENTINEL_LOGIN_PASSWORD",
    passwordHash: "$argon2id$SENTINEL_PASSWORD_HASH",
    rawRefreshToken: "SENTINEL_RAW_REFRESH_TOKEN",
    slug: "sentinel-tenant",
};

function createOrganisation(overrides = {}) {
    return {
        orgId: randomUUID(),
        name: "Example Organisation",
        slug: SENTINELS.slug,
        status: "ACTIVE",
        plan: "FREE",
        retention: {
            mode: "METADATA_ONLY",
        },
        ...overrides,
    };
}

function createUser(overrides = {}) {
    return {
        userId: randomUUID(),
        orgId: randomUUID(),
        email: SENTINELS.email,
        emailNormalized: SENTINELS.email,
        passwordHash: SENTINELS.passwordHash,
        displayName: "Example User",
        role: "EMPLOYEE",
        permissions: ["chat:send", "chat:view_own"],
        status: "ACTIVE",
        failedLoginCount: 0,
        ...overrides,
    };
}

function createTestLogger() {
    const entries = [];

    return {
        entries,
        logger: {
            error(data, message) {
                entries.push({
                    level: "error",
                    message,
                    ...data,
                });
            },
            info(data, message) {
                entries.push({
                    level: "info",
                    message,
                    ...data,
                });
            },
            warn(data, message) {
                entries.push({
                    level: "warn",
                    message,
                    ...data,
                });
            },
        },
    };
}

function createHarness(overrides = {}) {
    const organisation = Object.hasOwn(overrides, "organisation")
        ? overrides.organisation
        : createOrganisation();
    const user = Object.hasOwn(overrides, "user")
        ? overrides.user
        : createUser({
            orgId: organisation?.orgId ?? randomUUID(),
        });
    const calls = {
        accessTokenInputs: [],
        failureUpdates: [],
        findOrganisation: [],
        findUser: [],
        order: [],
        persistedMaterials: [],
        successUpdates: [],
        verificationHashes: [],
    };
    const refreshMaterial = {
        tokenId: randomUUID(),
        sessionId: randomUUID(),
        familyId: randomUUID(),
        orgId: organisation?.orgId ?? randomUUID(),
        userId: user?.userId ?? randomUUID(),
        tokenHash: "a".repeat(64),
        rawToken: SENTINELS.rawRefreshToken,
        expiresAt: new Date(Date.now() + 60_000),
    };
    const dependencies = {
        async createAccessToken(input) {
            calls.order.push("createAccessToken");
            calls.accessTokenInputs.push(input);
            return {
                accessToken: SENTINELS.accessToken,
                expiresInSeconds: 900,
            };
        },
        createInitialRefreshTokenMaterial(orgId, userId) {
            calls.order.push("createInitialRefreshTokenMaterial");
            assert.equal(orgId, organisation?.orgId);
            assert.equal(userId, user?.userId);
            return refreshMaterial;
        },
        async findOrganisationForLogin(slug) {
            calls.findOrganisation.push(slug);
            return organisation;
        },
        async findUserForLogin(orgId, emailNormalized) {
            calls.findUser.push({
                emailNormalized,
                orgId,
            });
            return user;
        },
        async incrementFailedLoginCount(orgId, userId) {
            calls.failureUpdates.push({
                orgId,
                userId,
            });
        },
        async persistInitialRefreshToken(material) {
            calls.order.push("persistInitialRefreshToken");
            calls.persistedMaterials.push(material);
        },
        async recordSuccessfulLogin(orgId, userId, lastLoginAt) {
            calls.successUpdates.push({
                lastLoginAt,
                orgId,
                userId,
            });
        },
        async verifyPassword(storedHash) {
            calls.verificationHashes.push(storedHash);
            return storedHash === user?.passwordHash;
        },
        ...overrides.dependencies,
    };
    const { entries, logger } = createTestLogger();

    return {
        calls,
        entries,
        input: {
            organisationSlug: SENTINELS.slug,
            emailNormalized: SENTINELS.email,
            password: SENTINELS.password,
        },
        logger,
        organisation,
        refreshMaterial,
        service: createAuthService(dependencies),
        user,
    };
}

async function captureError(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    assert.fail("Expected operation to reject.");
}

function assertGenericCredentialFailure(error) {
    assert.equal(error instanceof AppError, true);
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "INVALID_CREDENTIALS");
    assert.equal(error.message, "Invalid email or password.");
    assert.equal(error.details, undefined);
}

test("all credential and active-state failures share one public response", async () => {
    const scenarios = [
        createHarness({
            organisation: null,
        }),
        createHarness({
            organisation: createOrganisation({
                status: "SUSPENDED",
            }),
        }),
        createHarness({
            user: null,
        }),
        createHarness({
            user: createUser({
                status: "DISABLED",
            }),
        }),
        createHarness({
            dependencies: {
                async verifyPassword(storedHash) {
                    return storedHash.includes("SENTINEL_PASSWORD_HASH")
                        ? false
                        : false;
                },
            },
        }),
    ];
    const publicFailures = [];

    for (const harness of scenarios) {
        const error = await captureError(
            harness.service.login(
                harness.input,
                harness.logger,
            ),
        );
        assertGenericCredentialFailure(error);
        publicFailures.push({
            code: error.code,
            message: error.message,
            statusCode: error.statusCode,
        });
    }

    assert.equal(
        new Set(publicFailures.map(JSON.stringify)).size,
        1,
    );
});

test("missing organisation and user paths perform one dummy verification", async () => {
    for (const harness of [
        createHarness({
            organisation: null,
        }),
        createHarness({
            user: null,
        }),
    ]) {
        await captureError(
            harness.service.login(
                harness.input,
                harness.logger,
            ),
        );

        assert.equal(harness.calls.verificationHashes.length, 1);
        assert.notEqual(
            harness.calls.verificationHashes[0],
            SENTINELS.passwordHash,
        );
    }
});

test("malformed stored hash records an operational event then performs a dummy verification", async () => {
    const harness = createHarness();
    let verificationCount = 0;
    harness.service = createAuthService({
        async createAccessToken() {
            assert.fail("Access token must not be created.");
        },
        createInitialRefreshTokenMaterial() {
            assert.fail("Refresh token must not be created.");
        },
        async findOrganisationForLogin() {
            return harness.organisation;
        },
        async findUserForLogin() {
            return harness.user;
        },
        async incrementFailedLoginCount(orgId, userId) {
            harness.calls.failureUpdates.push({
                orgId,
                userId,
            });
        },
        async persistInitialRefreshToken() {
            assert.fail("Refresh token must not be persisted.");
        },
        async recordSuccessfulLogin() {
            assert.fail("Success metadata must not be updated.");
        },
        async verifyPassword() {
            verificationCount += 1;

            if (verificationCount === 1) {
                throw new Error("SENTINEL_ARGON_ERROR");
            }

            return false;
        },
    });

    const error = await captureError(
        harness.service.login(
            harness.input,
            harness.logger,
        ),
    );

    assertGenericCredentialFailure(error);
    assert.equal(verificationCount, 2);
    assert.equal(harness.calls.failureUpdates.length, 1);
    assert.equal(
        harness.entries.some(
            (entry) =>
                entry.event === "auth.login_operational_error"
                && entry.reasonCode === "PASSWORD_HASH_INVALID",
        ),
        true,
    );
});

test("known-user failures increment scoped metadata without blocking the response", async () => {
    const harness = createHarness({
        dependencies: {
            async incrementFailedLoginCount() {
                throw new Error("SENTINEL_METADATA_FAILURE");
            },
            async verifyPassword(storedHash) {
                return storedHash !== SENTINELS.passwordHash;
            },
        },
    });

    const error = await captureError(
        harness.service.login(
            harness.input,
            harness.logger,
        ),
    );

    assertGenericCredentialFailure(error);
    assert.equal(
        harness.entries.some(
            (entry) =>
                entry.event === "auth.login_operational_error"
                && entry.reasonCode === "LOGIN_METADATA_UPDATE_FAILED",
        ),
        true,
    );
});

test("successful login scopes the user lookup and persists refresh state before signing", async () => {
    const harness = createHarness();
    const result = await harness.service.login(
        harness.input,
        harness.logger,
    );

    assert.deepEqual(harness.calls.findOrganisation, [
        SENTINELS.slug,
    ]);
    assert.deepEqual(harness.calls.findUser, [
        {
            orgId: harness.organisation.orgId,
            emailNormalized: SENTINELS.email,
        },
    ]);
    assert.deepEqual(harness.calls.order, [
        "createInitialRefreshTokenMaterial",
        "persistInitialRefreshToken",
        "createAccessToken",
    ]);
    assert.equal(harness.calls.persistedMaterials.length, 1);
    assert.deepEqual(harness.calls.accessTokenInputs, [
        {
            userId: harness.user.userId,
            orgId: harness.organisation.orgId,
            role: "EMPLOYEE",
            permissions: ["chat:send", "chat:view_own"],
            sessionId: harness.refreshMaterial.sessionId,
        },
    ]);
    assert.equal(harness.calls.successUpdates.length, 1);
    assert.equal(
        harness.calls.successUpdates[0].orgId,
        harness.organisation.orgId,
    );
    assert.equal(
        harness.calls.successUpdates[0].userId,
        harness.user.userId,
    );
    assert.equal(
        harness.calls.successUpdates[0].lastLoginAt instanceof Date,
        true,
    );
    assert.equal(result.accessToken, SENTINELS.accessToken);
    assert.equal(result.refreshToken, SENTINELS.rawRefreshToken);
    assert.equal(result.user.organisation.orgId, harness.organisation.orgId);
    assert.equal(
        harness.entries.some(
            (entry) => entry.event === "auth.login_succeeded",
        ),
        true,
    );
});

test("refresh persistence is critical and prevents access-token creation", async () => {
    let accessTokenCreated = false;
    const harness = createHarness({
        dependencies: {
            async createAccessToken() {
                accessTokenCreated = true;
                return {
                    accessToken: SENTINELS.accessToken,
                    expiresInSeconds: 900,
                };
            },
            async persistInitialRefreshToken() {
                throw new Error("SENTINEL_MONGO_WRITE_FAILURE");
            },
        },
    });

    const error = await captureError(
        harness.service.login(
            harness.input,
            harness.logger,
        ),
    );

    assert.equal(error instanceof AppError, true);
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, "DEPENDENCY_UNAVAILABLE");
    assert.equal(accessTokenCreated, false);
    assert.equal(harness.calls.successUpdates.length, 0);
});

test("successful-login metadata is best-effort after token creation", async () => {
    const harness = createHarness({
        dependencies: {
            async recordSuccessfulLogin() {
                throw new Error("SENTINEL_METADATA_FAILURE");
            },
        },
    });

    const result = await harness.service.login(
        harness.input,
        harness.logger,
    );

    assert.equal(result.accessToken, SENTINELS.accessToken);
    assert.equal(
        harness.entries.some(
            (entry) =>
                entry.event === "auth.login_operational_error"
                && entry.reasonCode === "LOGIN_METADATA_UPDATE_FAILED",
        ),
        true,
    );
    assert.equal(
        harness.entries.some(
            (entry) => entry.event === "auth.login_succeeded",
        ),
        true,
    );
});

test("structured auth events contain no credentials, hashes, or tokens", async () => {
    const harness = createHarness();

    await harness.service.login(
        harness.input,
        harness.logger,
    );

    const output = JSON.stringify(harness.entries);

    for (const sentinel of Object.values(SENTINELS)) {
        assert.equal(output.includes(sentinel), false);
    }
    assert.equal(output.includes("passwordHash"), false);
    assert.equal(output.includes("accessToken"), false);
    assert.equal(output.includes("refreshToken"), false);
});
