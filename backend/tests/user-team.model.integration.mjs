import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "warn";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI =
    process.env.USER_TEAM_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_user_team_model_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "User/Team integration tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    teamModule,
    userModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/teams/team.model.js"),
    import("../dist/features/users/user.model.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { TeamModel } = teamModule;
const { UserModel } = userModule;

function validTeam(overrides = {}) {
    return {
        orgId: randomUUID(),
        name: `Integration Team ${randomUUID()}`,
        createdBy: randomUUID(),
        ...overrides,
    };
}

function validUser(overrides = {}) {
    return {
        orgId: randomUUID(),
        email: `employee-${randomUUID()}@example.com`,
        passwordHash: "stored-password-hash",
        displayName: "Integration Employee",
        role: "EMPLOYEE",
        ...overrides,
    };
}

function isDuplicateKey(error, expectedFields) {
    return error?.code === 11000
        && expectedFields.every(
            (field) => error?.keyPattern?.[field] === 1,
        );
}

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await TeamModel.init();
    await UserModel.init();
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("real Mongo creates only approved Team and User indexes", async () => {
    const teamIndexNames = (await TeamModel.collection.indexes())
        .map((index) => index.name)
        .filter((name) => name !== "_id_")
        .sort();
    const userIndexNames = (await UserModel.collection.indexes())
        .map((index) => index.name)
        .filter((name) => name !== "_id_")
        .sort();

    assert.deepEqual(teamIndexNames, [
        "idx_teams_org_active",
        "uniq_teams_org_name_normalized",
        "uniq_teams_team_id",
    ]);
    assert.deepEqual(userIndexNames, [
        "idx_users_org_role_status",
        "idx_users_org_team_status",
        "uniq_users_org_email_normalized",
        "uniq_users_user_id",
    ]);
});

test("team names are case-insensitively unique per organisation", async () => {
    const firstOrgId = randomUUID();
    const secondOrgId = randomUUID();
    const team = await TeamModel.create(
        validTeam({
            orgId: firstOrgId,
            name: "  Platform Engineering  ",
        }),
    );

    assert.equal(team.name, "Platform Engineering");
    assert.equal(team.nameNormalized, "platform engineering");
    assert.equal(team.isActive, false);
    assert.equal(team.createdAt instanceof Date, true);
    assert.equal(team.updatedAt instanceof Date, true);

    await assert.rejects(
        TeamModel.create(
            validTeam({
                orgId: firstOrgId,
                name: "pLaTfOrM eNgInEeRiNg",
            }),
        ),
        (error) => isDuplicateKey(
            error,
            ["orgId", "nameNormalized"],
        ),
    );

    await TeamModel.create(
        validTeam({
            orgId: secondOrgId,
            name: "PLATFORM ENGINEERING",
        }),
    );
});

test("team public IDs are unique and tenant identifiers stay immutable", async () => {
    const teamId = randomUUID();
    const originalOrgId = randomUUID();
    const team = await TeamModel.create(
        validTeam({
            teamId,
            orgId: originalOrgId,
        }),
    );

    await assert.rejects(
        TeamModel.create(
            validTeam({
                teamId,
            }),
        ),
        (error) => isDuplicateKey(error, ["teamId"]),
    );

    team.teamId = randomUUID();
    team.orgId = randomUUID();

    await assert.rejects(
        team.save(),
        (error) => error?.name === "ValidationError"
            && error?.errors?.teamId !== undefined
            && error?.errors?.orgId !== undefined,
    );

    const persisted = await TeamModel.findOne({
        orgId: originalOrgId,
        teamId,
    }).orFail();

    assert.equal(persisted.orgId, originalOrgId);
    assert.equal(persisted.teamId, teamId);
    assert.equal(persisted.nameNormalized, undefined);
    assert.equal("nameNormalized" in persisted.toJSON(), false);
});

test("emails are normalized and unique only inside one organisation", async () => {
    const firstOrgId = randomUUID();
    const secondOrgId = randomUUID();
    const user = await UserModel.create(
        validUser({
            orgId: firstOrgId,
            email: "  Employee@Example.COM  ",
        }),
    );

    assert.equal(user.email, "Employee@Example.COM");
    assert.equal(user.emailNormalized, "employee@example.com");
    assert.equal(user.status, "DISABLED");
    assert.equal(user.createdAt instanceof Date, true);
    assert.equal(user.updatedAt instanceof Date, true);

    await assert.rejects(
        UserModel.create(
            validUser({
                orgId: firstOrgId,
                email: "employee@example.com",
            }),
        ),
        (error) => isDuplicateKey(
            error,
            ["orgId", "emailNormalized"],
        ),
    );

    await UserModel.create(
        validUser({
            orgId: secondOrgId,
            email: "EMPLOYEE@EXAMPLE.COM",
        }),
    );
});

test("password and internal account state are excluded from normal queries and JSON", async () => {
    const lockedUntil = new Date("2026-07-27T11:00:00.000Z");
    const lastLoginAt = new Date("2026-07-27T10:00:00.000Z");
    const created = await UserModel.create(
        validUser({
            failedLoginCount: 3,
            lockedUntil,
            lastLoginAt,
        }),
    );
    const normalUser = await UserModel.findOne({
        orgId: created.orgId,
        userId: created.userId,
    }).orFail();

    assert.equal(normalUser.passwordHash, undefined);
    assert.equal(normalUser.emailNormalized, undefined);
    assert.equal(normalUser.failedLoginCount, undefined);
    assert.equal(normalUser.lockedUntil, undefined);
    assert.equal(normalUser.lastLoginAt?.toISOString(), lastLoginAt.toISOString());

    const internalUser = await UserModel.findOne({
        orgId: created.orgId,
        userId: created.userId,
    })
        .select(
            "+passwordHash +emailNormalized +failedLoginCount +lockedUntil",
        )
        .orFail();

    assert.equal(internalUser.passwordHash, "stored-password-hash");
    assert.equal(internalUser.emailNormalized, created.emailNormalized);
    assert.equal(internalUser.failedLoginCount, 3);
    assert.equal(internalUser.lockedUntil?.toISOString(), lockedUntil.toISOString());

    const serialized = internalUser.toJSON();

    assert.equal("passwordHash" in serialized, false);
    assert.equal("emailNormalized" in serialized, false);
    assert.equal("failedLoginCount" in serialized, false);
    assert.equal("lockedUntil" in serialized, false);
    assert.equal(
        serialized.lastLoginAt?.toISOString(),
        lastLoginAt.toISOString(),
    );
});

test("user public IDs are unique and tenant identifiers stay immutable", async () => {
    const userId = randomUUID();
    const originalOrgId = randomUUID();
    const user = await UserModel.create(
        validUser({
            userId,
            orgId: originalOrgId,
        }),
    );

    await assert.rejects(
        UserModel.create(
            validUser({
                userId,
            }),
        ),
        (error) => isDuplicateKey(error, ["userId"]),
    );

    user.userId = randomUUID();
    user.orgId = randomUUID();

    await assert.rejects(
        user.save(),
        (error) => error?.name === "ValidationError"
            && error?.errors?.userId !== undefined
            && error?.errors?.orgId !== undefined,
    );

    const persisted = await UserModel.findOne({
        orgId: originalOrgId,
        userId,
    }).orFail();

    assert.equal(persisted.orgId, originalOrgId);
    assert.equal(persisted.userId, userId);
});
