import assert from "node:assert/strict";
import test from "node:test";

const {
    DEMO_ORGANISATION,
    DEMO_PRIVATE_ADMIN,
    DEMO_PUBLIC_USER,
} = await import("../dist/scripts/demo-seed.config.js");
const {
    DemoIdentityProvisioningError,
    provisionDemoIdentity,
} = await import("../dist/scripts/demo-identity-provisioning.js");
const {
    parsePrivateDemoAdminEnvironment,
    parsePublicDemoResetEnvironment,
} = await import("../dist/scripts/demo-operations.config.js");

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PASSWORD = "safe protected password";

test("demo operations require explicit gates and remain dry-run by default", () => {
    assert.throws(
        () => parsePublicDemoResetEnvironment({
            DEMO_PUBLIC_PASSWORD: PASSWORD,
            MONGO_URI: "mongodb://localhost/demo",
        }),
        /ALLOW_PUBLIC_DEMO_RESET=true/,
    );
    assert.throws(
        () => parsePrivateDemoAdminEnvironment({
            MONGO_URI: "mongodb://localhost/demo",
            PROXIAI_DEMO_ADMIN_PASSWORD: PASSWORD,
        }),
        /ALLOW_DEMO_ADMIN_PROVISIONING=true/,
    );

    assert.equal(parsePublicDemoResetEnvironment({
        ALLOW_PUBLIC_DEMO_RESET: "true",
        DEMO_PUBLIC_PASSWORD: PASSWORD,
        MONGO_URI: "mongodb://localhost/demo",
    }).apply, false);
    assert.equal(parsePrivateDemoAdminEnvironment({
        ALLOW_DEMO_ADMIN_PROVISIONING: "true",
        MONGO_URI: "mongodb://localhost/demo",
        PROXIAI_DEMO_ADMIN_PASSWORD: PASSWORD,
    }).apply, false);
});

test("public reset restores exact employee scope and revokes sessions idempotently", async () => {
    const store = createFakeStore({
        displayName: "Drifted Demo",
        email: DEMO_PUBLIC_USER.email,
        failedLoginCount: 3,
        lockedUntil: new Date(),
        passwordHash: "hash:old password value",
        permissions: ["admin:view_logs"],
        role: "ORG_ADMIN",
        status: "ACTIVE",
        teamId: "33333333-3333-4333-8333-333333333333",
        userId: USER_ID,
    }, 2);

    const first = await provisionDemoIdentity({
        apply: true,
        password: PASSWORD,
        revokeSessionsOnEveryApply: true,
        target: {
            ...DEMO_PUBLIC_USER,
            organisationSlug: DEMO_ORGANISATION.slug,
            requiredRetentionMode: "METADATA_ONLY",
        },
    }, store.dependencies);
    const second = await provisionDemoIdentity({
        apply: true,
        password: PASSWORD,
        revokeSessionsOnEveryApply: true,
        target: {
            ...DEMO_PUBLIC_USER,
            organisationSlug: DEMO_ORGANISATION.slug,
            requiredRetentionMode: "METADATA_ONLY",
        },
    }, store.dependencies);

    assert.equal(first.action, "UPDATE");
    assert.equal(first.sessionsRevoked, 2);
    assert.equal(second.action, "RESET_SESSIONS");
    assert.equal(second.sessionsRevoked, 0);
    assert.equal(store.identity.role, "EMPLOYEE");
    assert.deepEqual(store.identity.permissions, ["chat:send", "chat:view_own"]);
    assert.equal(store.identity.teamId, undefined);
    assert.equal(store.identity.failedLoginCount, 0);
    assert.equal(store.identity.lockedUntil, undefined);
});

test("private admin provisioning is canonical and repeated apply has no second effect", async () => {
    const store = createFakeStore(null, 0);
    const input = {
        apply: true,
        password: PASSWORD,
        revokeSessionsOnEveryApply: false,
        target: {
            ...DEMO_PRIVATE_ADMIN,
            organisationSlug: DEMO_ORGANISATION.slug,
        },
    };

    const dryRun = await provisionDemoIdentity(
        { ...input, apply: false },
        store.dependencies,
    );
    const first = await provisionDemoIdentity(input, store.dependencies);
    const second = await provisionDemoIdentity(input, store.dependencies);

    assert.equal(dryRun.action, "CREATE");
    assert.equal(dryRun.applied, false);
    assert.equal(first.action, "CREATE");
    assert.equal(second.action, "NO_CHANGE");
    assert.equal(store.createCount, 1);
    assert.equal(store.updateCount, 0);
    assert.equal(store.revokeCount, 0);
    assert.equal(store.identity.email, "admin-demo@novastack.demo");
    assert.equal(store.identity.displayName, "NovaStack Admin Demo");
    assert.equal(store.identity.role, "ORG_ADMIN");
    assert.deepEqual(store.identity.permissions, [...DEMO_PRIVATE_ADMIN.permissions]);
});

test("public reset refuses unsafe retention without mutating any identity", async () => {
    const store = createFakeStore(null, 0, "ENCRYPTED_STORAGE");

    await assert.rejects(
        () => provisionDemoIdentity({
            apply: true,
            password: PASSWORD,
            revokeSessionsOnEveryApply: true,
            target: {
                ...DEMO_PUBLIC_USER,
                organisationSlug: DEMO_ORGANISATION.slug,
                requiredRetentionMode: "METADATA_ONLY",
            },
        }, store.dependencies),
        DemoIdentityProvisioningError,
    );
    assert.equal(store.createCount, 0);
    assert.equal(store.updateCount, 0);
    assert.equal(store.revokeCount, 0);
});

function createFakeStore(
    initialIdentity,
    activeSessions,
    retentionMode = "METADATA_ONLY",
) {
    let identity = initialIdentity;
    let sessions = activeSessions;
    let createCount = 0;
    let updateCount = 0;
    let revokeCount = 0;

    return {
        dependencies: {
            applyExistingIdentity: async ({ revokeSessions, update }) => {
                if (update !== undefined) {
                    updateCount += 1;
                    identity = {
                        ...identity,
                        ...update,
                        failedLoginCount: 0,
                        lockedUntil: undefined,
                        passwordHash: update.passwordHash ?? identity.passwordHash,
                        permissions: [...update.permissions],
                        teamId: undefined,
                    };
                }
                if (!revokeSessions) return 0;
                const revoked = sessions;
                sessions = 0;
                revokeCount += revoked;
                return revoked;
            },
            createIdentity: async (input) => {
                createCount += 1;
                identity = {
                    ...input,
                    failedLoginCount: 0,
                    permissions: [...input.permissions],
                    userId: USER_ID,
                };
            },
            findIdentity: async () => identity,
            findOrganisation: async () => ({
                orgId: ORG_ID,
                retentionMode,
                status: "ACTIVE",
            }),
            hashPassword: async (password) => `hash:${password}`,
            verifyPassword: async (hash, password) => hash === `hash:${password}`,
        },
        get createCount() { return createCount; },
        get identity() { return identity; },
        get revokeCount() { return revokeCount; },
        get updateCount() { return updateCount; },
    };
}
