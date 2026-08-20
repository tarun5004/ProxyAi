import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.MONGO_URI = process.env.ADMIN_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_admin_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);
assert.match(databaseName, /_test$/, "Admin tests require a dedicated *_test database.");

const [
    mongooseModule,
    mongoModule,
    { adminRepository },
    { RequestLogModel },
    { UserModel },
    { TeamModel },
    { AlertModel },
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/admin/admin.repository.js"),
    import("../dist/features/billing/request-log.model.js"),
    import("../dist/features/users/user.model.js"),
    import("../dist/features/teams/team.model.js"),
    import("../dist/features/alerts/alert.model.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const trustedOrgId = randomUUID();
const foreignOrgId = randomUUID();
const trustedUserId = randomUUID();

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        RequestLogModel.init(),
        UserModel.init(),
        TeamModel.init(),
        AlertModel.init(),
    ]);
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("admin repositories never return another organisation's resources", async () => {
    const trustedTeamId = randomUUID();

    await Promise.all([
        RequestLogModel.create([
            requestLog(trustedOrgId, trustedUserId),
            requestLog(foreignOrgId, randomUUID()),
        ]),
        UserModel.create([
            user(trustedOrgId, trustedUserId, "trusted@example.com"),
            user(foreignOrgId, randomUUID(), "foreign@example.com"),
        ]),
        TeamModel.create([
            team(trustedOrgId, trustedTeamId, trustedUserId, "Trusted team"),
            team(foreignOrgId, randomUUID(), randomUUID(), "Foreign team"),
        ]),
        AlertModel.create([
            alert(trustedOrgId, trustedUserId, "2026-08-20"),
            alert(foreignOrgId, randomUUID(), "2026-08-21"),
        ]),
    ]);

    const [logs, users, teams, alerts] = await Promise.all([
        adminRepository.listLogs({ orgId: trustedOrgId, limit: 25 }),
        adminRepository.listUsers({ orgId: trustedOrgId, limit: 25 }),
        adminRepository.listTeams({ orgId: trustedOrgId, limit: 25 }),
        adminRepository.listAlerts({ orgId: trustedOrgId, limit: 25 }),
    ]);

    assert.deepEqual(logs.items.map((item) => item.userId), [trustedUserId]);
    assert.deepEqual(users.items.map((item) => item.email), ["trusted@example.com"]);
    assert.deepEqual(teams.items.map((item) => item.name), ["Trusted team"]);
    assert.deepEqual(alerts.items.map((item) => item.userId), [trustedUserId]);
    assert.equal(JSON.stringify({ logs, users, teams, alerts }).includes("foreign@example.com"), false);
});

function requestLog(orgId, userId) {
    return {
        requestId: randomUUID(),
        orgId,
        userId,
        status: "COMPLETED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        inputTokens: 4,
        outputTokens: 6,
        totalTokens: 10,
    };
}

function user(orgId, userId, email) {
    return {
        userId,
        orgId,
        email,
        passwordHash: "stored-hash",
        displayName: email.split("@")[0],
        role: "EMPLOYEE",
        permissions: ["chat:send", "chat:view_own"],
        status: "ACTIVE",
    };
}

function team(orgId, teamId, createdBy, name) {
    return { orgId, teamId, createdBy, name, isActive: true };
}

function alert(orgId, userId, observedDay) {
    return {
        orgId,
        userId,
        observedDay,
        title: "Daily token usage anomaly",
        message: "Daily token usage exceeded the approved rolling baseline.",
        metadata: {
            observedTokens: 300,
            baselineAverageTokens: 100,
            baselineActiveDays: 3,
            baselineWindowStart: "2026-08-10",
            baselineWindowEnd: "2026-08-19",
            thresholdMultiplier: 2,
        },
    };
}
