import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI = process.env.PHASE9_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_phase9_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [
    mongooseModule,
    mongoModule,
    auditModelModule,
    auditServiceModule,
    auditMetadataModule,
    organisationModelModule,
    userModelModule,
    refreshTokenModelModule,
    alertModelModule,
    adminMutationModule,
    auditExportModule,
    encryptionModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/audit/audit.model.js"),
    import("../dist/features/audit/audit.service.js"),
    import("../dist/features/audit/audit.metadata.js"),
    import("../dist/features/organisations/organisation.model.js"),
    import("../dist/features/users/user.model.js"),
    import("../dist/features/auth/refresh-token.model.js"),
    import("../dist/features/alerts/alert.model.js"),
    import("../dist/features/admin/admin.mutation.service.js"),
    import("../dist/features/audit/audit.export.service.js"),
    import("../dist/shared/security/encryption.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { AuditLogModel } = auditModelModule;
const { appendAudit, withAuditedTransaction } = auditServiceModule;
const { buildAuditMetadata } = auditMetadataModule;
const { OrganisationModel } = organisationModelModule;
const { UserModel } = userModelModule;
const { RefreshTokenModel } = refreshTokenModelModule;
const { AlertModel } = alertModelModule;
const {
    changeUserRole,
    changeUserStatus,
    updateAlertResolution,
    updateOrganisationPolicy,
    updateOrganisationRetention,
} = adminMutationModule;
const { exportOrganisationAuditCsv } = auditExportModule;
const { initializeEncryption } = encryptionModule;
let transactionsAvailable = false;

test.before(async () => {
    initializeEncryption();
    await connectMongo();
    await mongoose.connection.dropDatabase();
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsAvailable = typeof hello.setName === "string" || hello.msg === "isdbgrid";
    await Promise.all([
        AuditLogModel.init(),
        OrganisationModel.init(),
        UserModel.init(),
        RefreshTokenModel.init(),
        AlertModel.init(),
    ]);
});

test.beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([
        AuditLogModel.createIndexes(),
        OrganisationModel.createIndexes(),
        UserModel.createIndexes(),
        RefreshTokenModel.createIndexes(),
        AlertModel.createIndexes(),
    ]);
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("role mutation synchronizes permissions and appends one audit record", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createFixture();

    const updated = await changeUserRole(fixture.context, fixture.targetUserId, "ORG_ADMIN");
    const audit = await AuditLogModel.findOne({ orgId: fixture.orgId, action: "user.role_changed" }).lean();

    assert.equal(updated.role, "ORG_ADMIN");
    assert.equal(updated.permissions.length, 8);
    assert.equal(audit?.resourceId, fixture.targetUserId);
});

test("audit failure rolls back the target mutation", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createFixture();

    await assert.rejects(withAuditedTransaction(async (session) => {
        await UserModel.updateOne(
            { orgId: fixture.orgId, userId: fixture.targetUserId },
            { $set: { status: "DISABLED" } },
            { session },
        );
        await appendAudit({
            orgId: fixture.orgId,
            actorId: fixture.context.actorId,
            actorType: "USER",
            actorRole: "ORG_ADMIN",
            action: "user.role_changed",
            outcome: "SUCCESS",
            resourceType: "USER",
            resourceId: fixture.targetUserId,
            metadata: buildAuditMetadata("user.role_changed", {
                oldRole: "EMPLOYEE",
                newRole: "ORG_ADMIN",
            }),
            requestId: fixture.context.requestId,
            auditId: "invalid-audit-id",
        }, session);
    }), (error) => error.code === "AUDIT_UNAVAILABLE");

    assert.equal((await UserModel.findOne({ userId: fixture.targetUserId }))?.status, "ACTIVE");
});

test("deactivation revokes tenant-scoped active refresh sessions", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createFixture();
    await RefreshTokenModel.create({
        tokenId: randomUUID(),
        sessionId: randomUUID(),
        familyId: randomUUID(),
        orgId: fixture.orgId,
        userId: fixture.targetUserId,
        tokenHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
    });

    await changeUserStatus(fixture.context, fixture.targetUserId, "DISABLED");

    const token = await RefreshTokenModel.findOne({ userId: fixture.targetUserId });
    assert.ok(token?.revokedAt instanceof Date);
});

test("foreign tenant mutation returns generic not found", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createFixture();
    const foreignContext = { ...fixture.context, orgId: randomUUID() };

    await assert.rejects(
        changeUserRole(foreignContext, fixture.targetUserId, "ORG_ADMIN"),
        (error) => error.statusCode === 404 && error.code === "NOT_FOUND",
    );
});

test("policy budget and retention changes commit with durable audit records", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createFixture();

    await updateOrganisationPolicy(fixture.context, {
        maskThreshold: 25,
        blockThreshold: 70,
        monthlyTokenBudget: 5_000,
    });
    await updateOrganisationRetention(fixture.context, "ENCRYPTED_STORAGE");

    const organisation = await OrganisationModel.findOne({ orgId: fixture.orgId }).lean();
    const actions = await AuditLogModel.find({ orgId: fixture.orgId }).distinct("action");
    assert.equal(organisation?.policy.maskThreshold, 25);
    assert.equal(organisation?.policy.blockThreshold, 70);
    assert.equal(organisation?.monthlyTokenBudget, 5_000);
    assert.equal(organisation?.retention.mode, "ENCRYPTED_STORAGE");
    assert.deepEqual(new Set(actions), new Set([
        "organisation.policy_changed",
        "organisation.budget_changed",
        "organisation.retention_changed",
    ]));
});

test("alert resolution remains tenant scoped and audited", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createFixture();
    const alert = await AlertModel.create({
        orgId: fixture.orgId,
        userId: fixture.targetUserId,
        observedDay: "2026-08-21",
        type: "ANOMALY",
        severity: "HIGH",
        title: "Daily token usage anomaly",
        message: "Daily token usage exceeded the approved rolling baseline.",
        metadata: {
            observedTokens: 300,
            baselineAverageTokens: 100,
            baselineActiveDays: 3,
            baselineWindowStart: "2026-08-14",
            baselineWindowEnd: "2026-08-20",
            thresholdMultiplier: 2,
        },
    });

    await assert.rejects(
        updateAlertResolution({ ...fixture.context, orgId: randomUUID() }, alert.alertId, true),
        (error) => error.statusCode === 404 && error.code === "NOT_FOUND",
    );
    await updateAlertResolution(fixture.context, alert.alertId, true);

    const updated = await AlertModel.findOne({ orgId: fixture.orgId, alertId: alert.alertId }).lean();
    const audit = await AuditLogModel.findOne({ orgId: fixture.orgId, action: "alert.resolved" }).lean();
    assert.equal(updated?.status, "RESOLVED");
    assert.ok(updated?.resolvedAt instanceof Date);
    assert.equal(audit?.resourceId, alert.alertId);
});

test("audit export returns only tenant records and appends its own audit", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createFixture();
    await OrganisationModel.updateOne(
        { orgId: fixture.orgId },
        { $set: { "featureFlags.auditExport": true } },
    );
    await appendAudit({
        orgId: fixture.orgId,
        actorId: fixture.context.actorId,
        actorType: "USER",
        actorRole: "ORG_ADMIN",
        action: "auth.login_succeeded",
        outcome: "SUCCESS",
        resourceType: "AUTH_SESSION",
        resourceId: randomUUID(),
        metadata: buildAuditMetadata("auth.login_succeeded", {}),
        requestId: randomUUID(),
    });
    await appendAudit({
        orgId: randomUUID(),
        actorType: "SYSTEM",
        action: "auth.login_failed",
        outcome: "FAILURE",
        resourceType: "AUTH_SESSION",
        metadata: buildAuditMetadata("auth.login_failed", { reasonCode: "USER_NOT_FOUND" }),
        requestId: randomUUID(),
    });

    const result = await exportOrganisationAuditCsv(fixture.context, {
        dateFrom: new Date(Date.now() - 60_000),
        dateTo: new Date(Date.now() + 60_000),
    });

    assert.match(result.csv, /auth\.login_succeeded/);
    assert.doesNotMatch(result.csv, /auth\.login_failed/);
    assert.equal(await AuditLogModel.countDocuments({ orgId: fixture.orgId, action: "audit.exported" }), 1);
});

async function createFixture() {
    const orgId = randomUUID();
    const actorId = randomUUID();
    const targetUserId = randomUUID();
    await OrganisationModel.create({
        orgId,
        name: "Phase 9 Test",
        slug: `phase9-${orgId.slice(0, 8)}`,
        status: "ACTIVE",
        policy: { maskThreshold: 20, blockThreshold: 60 },
    });
    await UserModel.create([
        userRecord(orgId, actorId, "ORG_ADMIN"),
        userRecord(orgId, targetUserId, "EMPLOYEE"),
    ]);
    return {
        orgId,
        targetUserId,
        context: {
            orgId,
            actorId,
            actorRole: "ORG_ADMIN",
            requestId: randomUUID(),
        },
    };
}

function userRecord(orgId, userId, role) {
    return {
        orgId,
        userId,
        email: `${userId}@example.test`,
        passwordHash: "hash",
        displayName: "Test User",
        role,
        permissions: role === "ORG_ADMIN"
            ? ["chat:send", "chat:view_own", "team:view_logs", "admin:view_logs", "admin:view_billing", "admin:manage_users", "admin:configure_policy", "admin:export_audit"]
            : ["chat:send", "chat:view_own"],
        status: "ACTIVE",
    };
}
