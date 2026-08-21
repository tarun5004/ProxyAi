import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.MONGO_URI = process.env.PHASE11_TENANT_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_phase11_tenant_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);
assert.match(
    databaseName,
    /_test$/,
    "Phase 11 tenant tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    organisationModule,
    userModule,
    teamModule,
    conversationModelModule,
    conversationRepositoryModule,
    messageModelModule,
    messageRepositoryModule,
    requestLogModule,
    billingRollupModule,
    billingRepositoryModule,
    billingServiceModule,
    analyticsDailyModule,
    analyticsRepositoryModule,
    anomalyRepositoryModule,
    alertModule,
    auditModelModule,
    auditRepositoryModule,
    auditServiceModule,
    auditMetadataModule,
    auditExportModule,
    refreshTokenModule,
    adminRepositoryModule,
    adminMutationModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/organisations/organisation.model.js"),
    import("../dist/features/users/user.model.js"),
    import("../dist/features/teams/team.model.js"),
    import("../dist/features/conversations/conversation.model.js"),
    import("../dist/features/conversations/conversation.repository.js"),
    import("../dist/features/messages/message.model.js"),
    import("../dist/features/messages/message.repository.js"),
    import("../dist/features/billing/request-log.model.js"),
    import("../dist/features/billing/billing-rollup.model.js"),
    import("../dist/features/billing/billing.repository.js"),
    import("../dist/features/billing/billing.service.js"),
    import("../dist/features/analytics/analytics-daily.model.js"),
    import("../dist/features/analytics/analytics.repository.js"),
    import("../dist/features/anomaly/anomaly.repository.js"),
    import("../dist/features/alerts/alert.model.js"),
    import("../dist/features/audit/audit.model.js"),
    import("../dist/features/audit/audit.repository.js"),
    import("../dist/features/audit/audit.service.js"),
    import("../dist/features/audit/audit.metadata.js"),
    import("../dist/features/audit/audit.export.service.js"),
    import("../dist/features/auth/refresh-token.model.js"),
    import("../dist/features/admin/admin.repository.js"),
    import("../dist/features/admin/admin.mutation.service.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { OrganisationModel } = organisationModule;
const { UserModel } = userModule;
const { TeamModel } = teamModule;
const { ConversationModel } = conversationModelModule;
const { conversationRepository } = conversationRepositoryModule;
const { MessageModel } = messageModelModule;
const { messageRepository } = messageRepositoryModule;
const { RequestLogModel } = requestLogModule;
const { BillingRollupModel } = billingRollupModule;
const { billingRepository } = billingRepositoryModule;
const { readAuthoritativeBudgetStatus } = billingServiceModule;
const { AnalyticsDailyAggregateModel } = analyticsDailyModule;
const { analyticsRepository } = analyticsRepositoryModule;
const { anomalyRepository } = anomalyRepositoryModule;
const { AlertModel } = alertModule;
const { AuditLogModel } = auditModelModule;
const { auditRepository } = auditRepositoryModule;
const { appendAudit } = auditServiceModule;
const { buildAuditMetadata } = auditMetadataModule;
const { exportOrganisationAuditCsv } = auditExportModule;
const { RefreshTokenModel } = refreshTokenModule;
const { adminRepository } = adminRepositoryModule;
const {
    changeUserRole,
    changeUserStatus,
    changeUserTeam,
    revokeUserSessions,
    updateAlertResolution,
} = adminMutationModule;

const indexedModels = [
    OrganisationModel,
    UserModel,
    TeamModel,
    ConversationModel,
    MessageModel,
    RequestLogModel,
    BillingRollupModel,
    AnalyticsDailyAggregateModel,
    AlertModel,
    AuditLogModel,
    RefreshTokenModel,
];
let transactionsAvailable = false;

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsAvailable = typeof hello.setName === "string"
        || hello.msg === "isdbgrid";
    await Promise.all(indexedModels.map((model) => model.createIndexes()));
});

test.beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all(indexedModels.map((model) => model.createIndexes()));
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("trusted tenant reads exclude foreign resource rows", async () => {
    const fixture = await createTenantPair();
    const trustedConversation = await ConversationModel.create(
        conversation(fixture.trusted),
    );
    const foreignConversation = await ConversationModel.create(
        conversation(fixture.foreign),
    );
    const trustedMessage = await MessageModel.create(
        message(fixture.trusted, trustedConversation.conversationId),
    );
    await MessageModel.create(
        message(fixture.foreign, foreignConversation.conversationId),
    );
    await Promise.all([
        TeamModel.create(team(fixture.trusted, "Trusted team")),
        TeamModel.create(team(fixture.foreign, "Foreign team")),
        AlertModel.create(alert(fixture.trusted, "2026-08-20")),
        AlertModel.create(alert(fixture.foreign, "2026-08-21")),
        appendSafeAudit(fixture.trusted),
        appendSafeAudit(fixture.foreign),
    ]);

    const [
        conversations,
        foreignConversationRead,
        messages,
        users,
        teams,
        alerts,
        audits,
    ] = await Promise.all([
        conversationRepository.listOwned({
            orgId: fixture.trusted.orgId,
            userId: fixture.trusted.userId,
            limit: 25,
        }),
        conversationRepository.findOwnedById(
            fixture.trusted.orgId,
            fixture.trusted.userId,
            foreignConversation.conversationId,
        ),
        messageRepository.listForConversation({
            orgId: fixture.trusted.orgId,
            conversationId: trustedConversation.conversationId,
            limit: 25,
        }),
        adminRepository.listUsers({
            orgId: fixture.trusted.orgId,
            limit: 25,
        }),
        adminRepository.listTeams({
            orgId: fixture.trusted.orgId,
            limit: 25,
        }),
        adminRepository.listAlerts({
            orgId: fixture.trusted.orgId,
            limit: 25,
        }),
        auditRepository.listForExport({
            orgId: fixture.trusted.orgId,
            dateFrom: new Date("2026-08-19T00:00:00.000Z"),
            dateTo: new Date("2026-08-22T00:00:00.000Z"),
            limit: 100,
        }),
    ]);

    assert.deepEqual(
        conversations.map((item) => item.conversationId),
        [trustedConversation.conversationId],
    );
    assert.equal(foreignConversationRead, null);
    assert.deepEqual(messages.map((item) => item.messageId), [trustedMessage.messageId]);
    assert.deepEqual(users.items.map((item) => item.userId), [fixture.trusted.userId]);
    assert.deepEqual(teams.items.map((item) => item.name), ["Trusted team"]);
    assert.deepEqual(alerts.items.map((item) => item.userId), [fixture.trusted.userId]);
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.orgId, fixture.trusted.orgId);

    const serialized = JSON.stringify({
        conversations,
        messages,
        users,
        teams,
        alerts,
        audits,
    });
    assert.equal(serialized.includes(fixture.foreign.orgId), false);
    assert.equal(serialized.includes(fixture.foreign.userId), false);
    assert.equal(serialized.includes("foreign@example.test"), false);
});

test("billing and analytics calculations exclude foreign tenant usage", async () => {
    const fixture = await createTenantPair();
    const periodStart = new Date("2026-08-01T00:00:00.000Z");
    const periodEnd = new Date("2026-09-01T00:00:00.000Z");

    await RequestLogModel.create([
        requestLog(fixture.trusted, {
            requestId: randomUUID(),
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            createdAt: new Date("2026-08-20T10:00:00.000Z"),
        }),
        requestLog(fixture.foreign, {
            requestId: randomUUID(),
            inputTokens: 300,
            outputTokens: 400,
            totalTokens: 700,
            model: "foreign-model-sentinel",
            createdAt: new Date("2026-08-20T10:01:00.000Z"),
        }),
    ]);
    await BillingRollupModel.create({
        orgId: fixture.foreign.orgId,
        period: "2026-08",
        usedTokens: 700,
        sourceRequestCount: 1,
    });
    await AnalyticsDailyAggregateModel.create([
        dailyAnalytics(fixture.trusted, 30),
        dailyAnalytics(fixture.foreign, 700),
    ]);

    const [budget, billing, analytics, dailyUsage] = await Promise.all([
        readAuthoritativeBudgetStatus(
            fixture.trusted.orgId,
            new Date("2026-08-20T12:00:00.000Z"),
        ),
        billingRepository.aggregatePeriodUsage(
            fixture.trusted.orgId,
            periodStart,
            periodEnd,
        ),
        analyticsRepository.aggregateDaily({
            orgId: fixture.trusted.orgId,
            start: periodStart,
            end: periodEnd,
        }),
        anomalyRepository.findDailyUsage({
            orgId: fixture.trusted.orgId,
            userId: fixture.trusted.userId,
            observedDay: "2026-08-20",
        }),
    ]);
    const trustedRollup = await BillingRollupModel.findOne({
        orgId: fixture.trusted.orgId,
        period: "2026-08",
    }).lean();

    assert.equal(budget.usedTokens, 30);
    assert.equal(billing.usedTokens, 30);
    assert.equal(billing.sourceRequestCount, 1);
    assert.equal(analytics.totalRequests, 1);
    assert.equal(analytics.totalTokens, 30);
    assert.equal(dailyUsage?.totalTokens, 30);
    assert.equal(trustedRollup?.usedTokens, 30);
    assert.equal(
        JSON.stringify({ budget, billing, analytics, dailyUsage })
            .includes("foreign-model-sentinel"),
        false,
    );
});

test("foreign resource identifiers cannot mutate owned data", async () => {
    const fixture = await createTenantPair();
    const foreignConversation = await ConversationModel.create(
        conversation(fixture.foreign),
    );

    const result = await conversationRepository.updateTitleOwned(
        fixture.trusted.orgId,
        fixture.trusted.userId,
        foreignConversation.conversationId,
        "Compromised title",
    );
    const unchanged = await ConversationModel.findOne({
        orgId: fixture.foreign.orgId,
        conversationId: foreignConversation.conversationId,
    }).lean();

    assert.equal(result, null);
    assert.equal(unchanged?.title, "New conversation");
    assert.equal(await AuditLogModel.countDocuments({ orgId: fixture.trusted.orgId }), 0);
});

test("foreign admin mutations and audit export remain tenant scoped", async (context) => {
    if (!transactionsAvailable) {
        return context.skip("MongoDB transactions require a replica set.");
    }

    const fixture = await createTenantPair();
    const foreignTeam = await TeamModel.create(team(fixture.foreign, "Foreign team"));
    const foreignAlert = await AlertModel.create(alert(fixture.foreign, "2026-08-21"));
    const foreignSession = await RefreshTokenModel.create(refreshToken(fixture.foreign));
    await appendSafeAudit(fixture.foreign);
    await OrganisationModel.updateOne(
        { orgId: fixture.trusted.orgId },
        { $set: { "featureFlags.auditExport": true } },
    );
    const mutationContext = {
        orgId: fixture.trusted.orgId,
        actorId: fixture.trusted.userId,
        actorRole: "ORG_ADMIN",
        requestId: randomUUID(),
    };

    for (const operation of [
        () => changeUserRole(mutationContext, fixture.foreign.userId, "ORG_ADMIN"),
        () => changeUserTeam(
            mutationContext,
            fixture.foreign.userId,
            foreignTeam.teamId,
        ),
        () => changeUserStatus(mutationContext, fixture.foreign.userId, "DISABLED"),
        () => revokeUserSessions(mutationContext, fixture.foreign.userId),
        () => updateAlertResolution(mutationContext, foreignAlert.alertId, true),
    ]) {
        await assert.rejects(
            operation(),
            (error) => error?.statusCode === 404 && error?.code === "NOT_FOUND",
        );
    }

    const exported = await exportOrganisationAuditCsv(mutationContext, {
        dateFrom: new Date("2026-08-19T00:00:00.000Z"),
        dateTo: new Date("2026-08-22T00:00:00.000Z"),
    });
    const [foreignUser, unchangedAlert, unchangedSession] = await Promise.all([
        UserModel.findOne({
            orgId: fixture.foreign.orgId,
            userId: fixture.foreign.userId,
        }).lean(),
        AlertModel.findOne({
            orgId: fixture.foreign.orgId,
            alertId: foreignAlert.alertId,
        }).lean(),
        RefreshTokenModel.findOne({
            orgId: fixture.foreign.orgId,
            tokenId: foreignSession.tokenId,
        }).lean(),
    ]);

    assert.equal(foreignUser?.role, "EMPLOYEE");
    assert.equal(foreignUser?.status, "ACTIVE");
    assert.equal(foreignUser?.teamId, undefined);
    assert.equal(unchangedAlert?.status, "OPEN");
    assert.equal(unchangedSession?.revokedAt, undefined);
    assert.doesNotMatch(exported.csv, /auth\.login_succeeded/);
    assert.equal(
        await AuditLogModel.countDocuments({
            orgId: fixture.trusted.orgId,
            action: { $ne: "audit.exported" },
        }),
        0,
    );
});

async function createTenantPair() {
    const trusted = tenant("trusted");
    const foreign = tenant("foreign");
    await OrganisationModel.create([
        organisation(trusted),
        organisation(foreign),
    ]);
    await UserModel.create([
        user(trusted, "ORG_ADMIN"),
        user(foreign, "EMPLOYEE"),
    ]);

    return { trusted, foreign };
}

function tenant(label) {
    return {
        label,
        orgId: randomUUID(),
        userId: randomUUID(),
    };
}

function organisation(scope) {
    return {
        orgId: scope.orgId,
        name: `${scope.label} organisation`,
        slug: `${scope.label}-${scope.orgId.slice(0, 8)}`,
        status: "ACTIVE",
        monthlyTokenBudget: 10_000,
        policy: { maskThreshold: 20, blockThreshold: 60 },
    };
}

function user(scope, role) {
    return {
        orgId: scope.orgId,
        userId: scope.userId,
        email: `${scope.label}@example.test`,
        passwordHash: "stored-hash",
        displayName: `${scope.label} user`,
        role,
        permissions: role === "ORG_ADMIN"
            ? [
                "chat:send",
                "chat:view_own",
                "team:view_logs",
                "admin:view_logs",
                "admin:view_billing",
                "admin:manage_users",
                "admin:configure_policy",
                "admin:export_audit",
            ]
            : ["chat:send", "chat:view_own"],
        status: "ACTIVE",
    };
}

function team(scope, name) {
    return {
        orgId: scope.orgId,
        teamId: randomUUID(),
        createdBy: scope.userId,
        name,
        isActive: true,
    };
}

function conversation(scope) {
    return {
        orgId: scope.orgId,
        userId: scope.userId,
    };
}

function message(scope, conversationId) {
    return {
        orgId: scope.orgId,
        conversationId,
        userId: scope.userId,
        role: "USER",
    };
}

function requestLog(scope, overrides) {
    return {
        requestId: randomUUID(),
        orgId: scope.orgId,
        userId: scope.userId,
        status: "COMPLETED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        ...overrides,
    };
}

function dailyAnalytics(scope, totalTokens) {
    return {
        orgId: scope.orgId,
        userId: scope.userId,
        date: "2026-08-20",
        scope: "USER",
        totalRequests: 1,
        successfulRequests: 1,
        blockedRequests: 0,
        maskedRequests: 0,
        failedRequests: 0,
        interruptedRequests: 0,
        knownUsageRequestCount: 1,
        unknownUsageRequestCount: 0,
        inputTokens: Math.floor(totalTokens / 3),
        outputTokens: totalTokens - Math.floor(totalTokens / 3),
        totalTokens,
        providerModelRequestCounts: [{
            providerId: "groq",
            model: "openai/gpt-oss-20b",
            requestCount: 1,
        }],
    };
}

function alert(scope, observedDay) {
    return {
        orgId: scope.orgId,
        userId: scope.userId,
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

function appendSafeAudit(scope) {
    return appendAudit({
        orgId: scope.orgId,
        actorId: scope.userId,
        actorType: "USER",
        actorRole: "ORG_ADMIN",
        action: "auth.login_succeeded",
        outcome: "SUCCESS",
        resourceType: "AUTH_SESSION",
        resourceId: randomUUID(),
        metadata: buildAuditMetadata("auth.login_succeeded", {}),
        requestId: randomUUID(),
        occurredAt: new Date("2026-08-20T10:00:00.000Z"),
    });
}

function refreshToken(scope) {
    return {
        tokenId: randomUUID(),
        sessionId: randomUUID(),
        familyId: randomUUID(),
        orgId: scope.orgId,
        userId: scope.userId,
        tokenHash: randomUUID().replaceAll("-", "").repeat(2),
        expiresAt: new Date(Date.now() + 60_000),
    };
}
