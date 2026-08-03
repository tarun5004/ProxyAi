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
    rawRefreshToken: "SENTINEL_RAW_REFRESH_TOKEN",
    tokenHash: "SENTINEL_TOKEN_HASH",
};

function createRefreshToken(overrides = {}) {
    return {
        _id: randomUUID(),
        tokenId: randomUUID(),
        sessionId: randomUUID(),
        familyId: randomUUID(),
        orgId: randomUUID(),
        userId: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    };
}

function createOrganisation(overrides = {}) {
    return {
        orgId: randomUUID(),
        status: "ACTIVE",
        ...overrides,
    };
}

function createUser(overrides = {}) {
    return {
        userId: randomUUID(),
        orgId: randomUUID(),
        role: "EMPLOYEE",
        permissions: ["chat:send"],
        status: "ACTIVE",
        ...overrides,
    };
}

function createTestLogger() {
    const entries = [];

    return {
        entries,
        logger: {
            error(data, message) {
                entries.push({ level: "error", message, ...data });
            },
            info(data, message) {
                entries.push({ level: "info", message, ...data });
            },
            warn(data, message) {
                entries.push({ level: "warn", message, ...data });
            },
        },
    };
}

function createHarness(overrides = {}) {
    const token = overrides.token ?? createRefreshToken();
    const organisation =
        overrides.organisation
        ?? createOrganisation({ orgId: token.orgId });
    const user =
        overrides.user
        ?? createUser({
            orgId: token.orgId,
            userId: token.userId,
        });
    const replacement = {
        tokenId: randomUUID(),
        sessionId: token.sessionId,
        familyId: token.familyId,
        orgId: token.orgId,
        userId: token.userId,
        tokenHash: "b".repeat(64),
        rawToken: "SENTINEL_REPLACEMENT_RAW_TOKEN",
        expiresAt: new Date(Date.now() + 120_000),
    };
    const calls = {
        accessTokenInputs: [],
        claimed: [],
        order: [],
        persistedReplacements: [],
        revokedFamilies: [],
    };
    const dependencies = {
        async claimRefreshTokenForRotation(
            tokenDocumentId,
            orgId,
            replacedByTokenId,
            usedAt,
        ) {
            calls.order.push("claim");
            calls.claimed.push({
                orgId,
                replacedByTokenId,
                tokenDocumentId,
                usedAt,
            });
            return token;
        },
        async createAccessToken(input) {
            calls.order.push("createAccessToken");
            calls.accessTokenInputs.push(input);
            return {
                accessToken: SENTINELS.accessToken,
                expiresInSeconds: 900,
            };
        },
        createInitialRefreshTokenMaterial() {
            assert.fail("Login refresh material must not be created.");
        },
        createRotatedRefreshTokenMaterial(input) {
            calls.order.push("createRotatedRefreshTokenMaterial");
            assert.deepEqual(input, {
                familyId: token.familyId,
                orgId: token.orgId,
                sessionId: token.sessionId,
                userId: token.userId,
            });
            return replacement;
        },
        async findOrganisationByOrgId(orgId) {
            calls.order.push("findOrganisationByOrgId");
            assert.equal(orgId, token.orgId);
            return organisation;
        },
        async findOrganisationForLogin() {
            assert.fail("Login organisation lookup must not run.");
        },
        async findRefreshTokenByHash(tokenHash) {
            calls.order.push("findRefreshTokenByHash");
            assert.equal(tokenHash, SENTINELS.tokenHash);
            return token;
        },
        async findUserByOrgIdAndUserId(orgId, userId) {
            calls.order.push("findUserByOrgIdAndUserId");
            assert.equal(orgId, token.orgId);
            assert.equal(userId, token.userId);
            return user;
        },
        async findUserForLogin() {
            assert.fail("Login user lookup must not run.");
        },
        hashRefreshToken(rawToken) {
            assert.equal(rawToken, SENTINELS.rawRefreshToken);
            return SENTINELS.tokenHash;
        },
        async incrementFailedLoginCount() {},
        async persistInitialRefreshToken() {
            assert.fail("Initial refresh persistence must not run.");
        },
        async persistReplacementRefreshToken(input) {
            calls.order.push("persistReplacementRefreshToken");
            calls.persistedReplacements.push(input);
        },
        async recordSuccessfulLogin() {},
        async revokeRefreshTokenFamily(input) {
            calls.order.push("revokeRefreshTokenFamily");
            calls.revokedFamilies.push(input);
        },
        async verifyPassword() {
            assert.fail("Password verification must not run.");
        },
        ...overrides.dependencies,
    };
    const { entries, logger } = createTestLogger();

    return {
        calls,
        entries,
        logger,
        replacement,
        service: createAuthService(dependencies),
        token,
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

function assertInvalidRefresh(error) {
    assert.equal(error instanceof AppError, true);
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "INVALID_REFRESH_TOKEN");
    assert.equal(error.message, "Session is invalid or expired.");
}

function assertAuthUnavailable(error) {
    assert.equal(error instanceof AppError, true);
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, "AUTH_TEMPORARILY_UNAVAILABLE");
}

test("valid refresh claims old token before reloading current state", async () => {
    const token = createRefreshToken();
    const user = createUser({
        orgId: token.orgId,
        permissions: ["admin:view_logs", "admin:manage_users"],
        role: "ORG_ADMIN",
        userId: token.userId,
    });
    const harness = createHarness({ token, user });

    const result = await harness.service.refreshSession(
        SENTINELS.rawRefreshToken,
        harness.logger,
    );

    assert.deepEqual(harness.calls.order, [
        "findRefreshTokenByHash",
        "createRotatedRefreshTokenMaterial",
        "claim",
        "findOrganisationByOrgId",
        "findUserByOrgIdAndUserId",
        "persistReplacementRefreshToken",
        "createAccessToken",
    ]);
    assert.deepEqual(harness.calls.accessTokenInputs, [
        {
            orgId: token.orgId,
            permissions: ["admin:view_logs", "admin:manage_users"],
            role: "ORG_ADMIN",
            sessionId: token.sessionId,
            userId: token.userId,
        },
    ]);
    assert.equal(result.accessToken, SENTINELS.accessToken);
    assert.equal(result.refreshToken, harness.replacement.rawToken);
    assert.equal(harness.calls.persistedReplacements.length, 1);
    assert.equal(harness.calls.revokedFamilies.length, 0);
});

test("used token revokes the trusted family and fails generically", async () => {
    const token = createRefreshToken({
        usedAt: new Date(),
    });
    const harness = createHarness({ token });

    const error = await captureError(
        harness.service.refreshSession(
            SENTINELS.rawRefreshToken,
            harness.logger,
        ),
    );

    assertInvalidRefresh(error);
    assert.deepEqual(harness.calls.revokedFamilies, [
        {
            familyId: token.familyId,
            orgId: token.orgId,
            sessionId: token.sessionId,
            userId: token.userId,
        },
    ]);
    assert.equal(
        harness.entries.some(
            (entry) => entry.event === "auth.refresh_reuse_detected",
        ),
        true,
    );
});

test("inactive current state revokes the family and fails generically", async () => {
    for (const harness of [
        createHarness({
            organisation: createOrganisation({ status: "SUSPENDED" }),
        }),
        createHarness({
            user: createUser({ status: "DISABLED" }),
        }),
    ]) {
        const error = await captureError(
            harness.service.refreshSession(
                SENTINELS.rawRefreshToken,
                harness.logger,
            ),
        );

        assertInvalidRefresh(error);
        assert.equal(harness.calls.revokedFamilies.length, 1);
    }
});

test("post-claim replacement failure revokes family and returns generic 503", async () => {
    const harness = createHarness({
        dependencies: {
            async persistReplacementRefreshToken() {
                throw new Error("SENTINEL_MONGO_WRITE_FAILURE");
            },
        },
    });

    const error = await captureError(
        harness.service.refreshSession(
            SENTINELS.rawRefreshToken,
            harness.logger,
        ),
    );

    assertAuthUnavailable(error);
    assert.equal(harness.calls.revokedFamilies.length, 1);
    assert.equal(
        harness.entries.some(
            (entry) =>
                entry.event === "auth.refresh_operational_error"
                && entry.reasonCode ===
                    "REFRESH_TOKEN_PERSISTENCE_FAILED",
        ),
        true,
    );
});

test("structured refresh events contain no token material", async () => {
    const harness = createHarness();

    await harness.service.refreshSession(
        SENTINELS.rawRefreshToken,
        harness.logger,
    );

    const output = JSON.stringify(harness.entries);

    for (const sentinel of Object.values(SENTINELS)) {
        assert.equal(output.includes(sentinel), false);
    }
    assert.equal(output.includes("cookie"), false);
    assert.equal(output.includes("tokenHash"), false);
});
