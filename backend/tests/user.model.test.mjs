import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const { UserModel } = await import(
    "../dist/features/users/user.model.js"
);

function validUser(overrides = {}) {
    return {
        orgId: randomUUID(),
        email: "employee@example.com",
        passwordHash: "stored-password-hash",
        displayName: "Example Employee",
        role: "EMPLOYEE",
        ...overrides,
    };
}

async function assertValidationFailure(input, path) {
    await assert.rejects(
        new UserModel(input).validate(),
        (error) => {
            assert.equal(error?.name, "ValidationError");
            assert.notEqual(error?.errors?.[path], undefined);
            return true;
        },
    );
}

async function assertStrictFailure(input) {
    let document;

    try {
        document = new UserModel(input);
    } catch (error) {
        assert.match(
            String(error),
            /StrictModeError|strict mode is set to throw/i,
        );
        return;
    }

    await assert.rejects(
        document.validate(),
        /StrictModeError|strict mode is set to throw/i,
    );
}

test("valid user receives safe defaults and a UUID v4", async () => {
    const user = new UserModel(
        validUser({
            email: "  Employee@Example.COM  ",
        }),
    );

    await user.validate();

    assert.match(
        user.userId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(user.email, "Employee@Example.COM");
    assert.equal(user.emailNormalized, "employee@example.com");
    assert.equal(user.status, "DISABLED");
    assert.deepEqual(user.permissions, []);
    assert.equal(user.failedLoginCount, 0);
});

test("orgId and userId are required immutable UUID identifiers", async () => {
    await assertValidationFailure(
        validUser({
            orgId: undefined,
        }),
        "orgId",
    );
    await assertValidationFailure(
        validUser({
            orgId: "not-a-uuid",
        }),
        "orgId",
    );

    assert.equal(UserModel.schema.path("orgId").options.immutable, true);
    assert.equal(UserModel.schema.path("userId").options.immutable, true);
});

test("role, status, and permissions use fixed allowlists", async () => {
    await assertValidationFailure(
        validUser({
            role: "SUPER_ADMIN",
        }),
        "role",
    );
    await assertValidationFailure(
        validUser({
            status: "SUSPENDED",
        }),
        "status",
    );
    await assertValidationFailure(
        validUser({
            permissions: ["platform:view_health"],
        }),
        "permissions.0",
    );
    await assertValidationFailure(
        validUser({
            permissions: ["chat:send", "chat:send"],
        }),
        "permissions",
    );

    await new UserModel(
        validUser({
            permissions: [
                "chat:send",
                "chat:view_own",
                "team:view_logs",
            ],
        }),
    ).validate();
});

test("only an active team lead requires a valid teamId", async () => {
    await assertValidationFailure(
        validUser({
            role: "TEAM_LEAD",
            status: "ACTIVE",
        }),
        "teamId",
    );

    await new UserModel(
        validUser({
            role: "TEAM_LEAD",
            status: "DISABLED",
        }),
    ).validate();

    await new UserModel(
        validUser({
            role: "TEAM_LEAD",
            status: "ACTIVE",
            teamId: randomUUID(),
        }),
    ).validate();

    await assertValidationFailure(
        validUser({
            teamId: "not-a-uuid",
        }),
        "teamId",
    );
});

test("password and internal account fields stay hidden", async () => {
    const lastLoginAt = new Date("2026-07-27T10:00:00.000Z");
    const user = new UserModel(
        validUser({
            failedLoginCount: 2,
            lockedUntil: new Date("2026-07-27T10:30:00.000Z"),
            lastLoginAt,
        }),
    );

    await user.validate();

    for (const path of [
        "passwordHash",
        "emailNormalized",
        "failedLoginCount",
        "lockedUntil",
    ]) {
        assert.equal(UserModel.schema.path(path).options.select, false);
        assert.equal(path in user.toJSON(), false);
    }

    assert.notEqual(
        UserModel.schema.path("lastLoginAt").options.select,
        false,
    );
    assert.equal(user.toJSON().lastLoginAt?.toISOString(), lastLoginAt.toISOString());
});

test("unknown user fields fail strict validation", async () => {
    await assertStrictFailure(
        validUser({
            organisationRoleOverride: "ORG_ADMIN",
        }),
    );
});

test("user schema declares only approved indexes and collection", () => {
    assert.equal(UserModel.collection.collectionName, "users");
    assert.deepEqual(
        UserModel.schema.indexes(),
        [
            [
                {
                    userId: 1,
                },
                {
                    name: "uniq_users_user_id",
                    unique: true,
                },
            ],
            [
                {
                    orgId: 1,
                    emailNormalized: 1,
                },
                {
                    name: "uniq_users_org_email_normalized",
                    unique: true,
                },
            ],
            [
                {
                    orgId: 1,
                    teamId: 1,
                    status: 1,
                },
                {
                    name: "idx_users_org_team_status",
                },
            ],
            [
                {
                    orgId: 1,
                    role: 1,
                    status: 1,
                },
                {
                    name: "idx_users_org_role_status",
                },
            ],
        ],
    );
});
