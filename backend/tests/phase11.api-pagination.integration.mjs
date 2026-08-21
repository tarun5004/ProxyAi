import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import express from "express";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.MONGO_URI = process.env.PHASE11_API_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_phase11_api_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);
assert.match(databaseName, /_test$/, "Phase 11 API tests require a dedicated *_test database.");

const [
    mongooseModule,
    mongoModule,
    adminController,
    adminCursor,
    adminSchemas,
    conversationController,
    conversationCursor,
    conversationSchemas,
    messageController,
    messageCursor,
    messageSchemas,
    { listAdminAlerts, listAdminLogs, listAdminTeams, listAdminUsers },
    { listConversationsForOwner },
    { listMessagesForConversationOwner },
    { ConversationModel },
    { MessageModel },
    { RequestLogModel },
    { UserModel },
    { TeamModel },
    { AlertModel },
    { globalErrorHandler },
    { requestIdMiddleware },
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/admin/admin.controller.js"),
    import("../dist/features/admin/admin.cursor.js"),
    import("../dist/features/admin/admin.schema.js"),
    import("../dist/features/conversations/conversation.controller.js"),
    import("../dist/features/conversations/conversation.cursor.js"),
    import("../dist/features/conversations/conversation.schema.js"),
    import("../dist/features/messages/message.controller.js"),
    import("../dist/features/messages/message.cursor.js"),
    import("../dist/features/messages/message.schema.js"),
    import("../dist/features/admin/admin.service.js"),
    import("../dist/features/conversations/conversation.service.js"),
    import("../dist/features/messages/message.service.js"),
    import("../dist/features/conversations/conversation.model.js"),
    import("../dist/features/messages/message.model.js"),
    import("../dist/features/billing/request-log.model.js"),
    import("../dist/features/users/user.model.js"),
    import("../dist/features/teams/team.model.js"),
    import("../dist/features/alerts/alert.model.js"),
    import("../dist/shared/middleware/error.middleware.js"),
    import("../dist/shared/middleware/request-id.middleware.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const trustedOrgId = randomUUID();
const trustedUserId = randomUUID();
const foreignOrgId = randomUUID();
let server;
let origin;

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        ConversationModel.init(),
        MessageModel.init(),
        RequestLogModel.init(),
        UserModel.init(),
        TeamModel.init(),
        AlertModel.init(),
    ]);

    server = createTestApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    origin = `http://127.0.0.1:${address.port}`;
});

test.beforeEach(async () => {
    await Promise.all([
        ConversationModel.deleteMany({}),
        MessageModel.deleteMany({}),
        UserModel.deleteMany({}),
        TeamModel.deleteMany({}),
        AlertModel.deleteMany({}),
    ]);
    await RequestLogModel.collection.deleteMany({});
});

test.after(async () => {
    server.close();
    await once(server, "close");
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("all list schemas reject invalid limits, duplicate values, and unsupported filters", () => {
    const listSchemas = [
        adminSchemas.adminLogsQuerySchema,
        adminSchemas.adminAlertsQuerySchema,
        adminSchemas.adminUsersQuerySchema,
        adminSchemas.adminTeamsQuerySchema,
        conversationSchemas.listConversationsQuerySchema,
        messageSchemas.listMessagesQuerySchema,
    ];

    for (const schema of listSchemas) {
        for (const limit of ["-1", "0", "101", "1.5", "not-a-number", ["1", "2"]]) {
            assert.equal(schema.safeParse({ limit }).success, false);
        }
        assert.equal(schema.safeParse({ unsupported: "value" }).success, false);
        assert.equal(schema.safeParse({ limit: "100" }).success, true);
    }

    assert.equal(adminSchemas.adminLogsQuerySchema.safeParse({ provider: "unknown" }).success, false);
    assert.equal(adminSchemas.adminLogsQuerySchema.safeParse({ status: "UNKNOWN" }).success, false);
    assert.equal(adminSchemas.adminAlertsQuerySchema.safeParse({ userId: "not-a-uuid" }).success, false);
    assert.equal(adminSchemas.adminUsersQuerySchema.safeParse({ role: "SUPER_ADMIN" }).success, false);
    assert.equal(adminSchemas.adminTeamsQuerySchema.safeParse({ isActive: "yes" }).success, false);
});

test("cursor decoders reject structural tampering and expose no tenant-private values", () => {
    const sentinels = [
        trustedOrgId,
        foreignOrgId,
        "private@example.com",
        "SENTINEL_RAW_PROMPT",
        "SENTINEL_SECRET",
    ];
    const validCursors = [
        adminCursor.encodeAdminCursor({ createdAt: new Date("2026-08-20T10:00:00.000Z"), id: randomUUID() }),
        conversationCursor.encodeConversationCursor({ conversationId: randomUUID(), lastMessageAt: null }),
        messageCursor.encodeMessageCursor({ createdAt: new Date("2026-08-20T10:00:00.000Z"), messageId: randomUUID() }),
    ];

    for (const cursor of validCursors) {
        for (const sentinel of sentinels) {
            assert.equal(cursor.includes(sentinel), false);
        }
    }

    const tampered = Buffer.from(JSON.stringify({
        createdAt: "2026-08-20T10:00:00.000Z",
        id: randomUUID(),
        orgId: foreignOrgId,
    })).toString("base64url");

    for (const decode of [
        adminCursor.decodeAdminCursor,
        conversationCursor.decodeConversationCursor,
        messageCursor.decodeMessageCursor,
    ]) {
        assert.throws(
            () => decode(tampered),
            (error) => error?.statusCode === 400 && error?.code === "INVALID_CURSOR",
        );
    }
});

test("all persisted list pagination is stable for tied timestamps, bounded, and tenant scoped", async () => {
    const createdAt = new Date("2026-08-20T10:00:00.000Z");
    const trustedTeamIds = [randomUUID(), randomUUID(), randomUUID()];
    const trustedUserIds = [trustedUserId, randomUUID(), randomUUID()];

    await Promise.all([
        RequestLogModel.create(trustedUserIds.map((userId) => requestLog(trustedOrgId, userId, createdAt))),
        UserModel.create(trustedUserIds.map((userId, index) => user(trustedOrgId, userId, `user-${index}@example.com`, createdAt))),
        TeamModel.create(trustedTeamIds.map((teamId, index) => team(trustedOrgId, teamId, trustedUserId, `Team ${index}`, createdAt))),
        AlertModel.create(trustedUserIds.map((userId, index) => alert(trustedOrgId, userId, `2026-08-${20 - index}`, createdAt))),
        RequestLogModel.create(requestLog(foreignOrgId, randomUUID(), new Date("2026-08-21T10:00:00.000Z"))),
    ]);

    const listCases = [
        [listAdminLogs, "requestId"],
        [listAdminUsers, "userId"],
        [listAdminTeams, "teamId"],
        [listAdminAlerts, "alertId"],
    ];

    for (const [list, idField] of listCases) {
        const complete = await list({ orgId: trustedOrgId, limit: 100 });
        const first = await list({ orgId: trustedOrgId, limit: 2 });
        const second = await list({
            orgId: trustedOrgId,
            limit: 2,
            cursor: adminCursor.decodeAdminCursor(first.nextCursor),
        });
        const pageIds = [...first.items, ...second.items].map((item) => item[idField]);

        assert.equal(first.items.length, 2);
        assert.equal(second.items.length, 1);
        assert.deepEqual(pageIds, complete.items.map((item) => item[idField]));
        assert.equal(new Set(pageIds).size, 3);
        assert.equal(JSON.stringify([...first.items, ...second.items]).includes(foreignOrgId), false);
    }

    const conversationIds = [randomUUID(), randomUUID(), randomUUID()];
    const lastMessageAt = new Date("2026-08-20T11:00:00.000Z");
    await ConversationModel.create(conversationIds.map((conversationId) => ({
        conversationId,
        orgId: trustedOrgId,
        userId: trustedUserId,
        lastMessageAt,
    })));
    await ConversationModel.create({
        orgId: foreignOrgId,
        userId: randomUUID(),
        lastMessageAt,
    });

    const completeConversations = await listConversationsForOwner({
        orgId: trustedOrgId,
        userId: trustedUserId,
        limit: 100,
    });
    const firstConversations = await listConversationsForOwner({
        orgId: trustedOrgId,
        userId: trustedUserId,
        limit: 2,
    });
    const secondConversations = await listConversationsForOwner({
        orgId: trustedOrgId,
        userId: trustedUserId,
        limit: 2,
        cursor: conversationCursor.decodeConversationCursor(firstConversations.nextCursor),
    });
    assert.deepEqual(
        [...firstConversations.items, ...secondConversations.items].map((item) => item.conversationId),
        completeConversations.items.map((item) => item.conversationId),
    );

    const messageIds = [randomUUID(), randomUUID(), randomUUID()];
    const messageCreatedAt = new Date("2026-08-20T12:00:00.000Z");
    await MessageModel.create(messageIds.map((messageId) => ({
        messageId,
        orgId: trustedOrgId,
        conversationId: conversationIds[0],
        userId: trustedUserId,
        role: "USER",
        createdAt: messageCreatedAt,
    })));
    await MessageModel.create({
        orgId: foreignOrgId,
        conversationId: conversationIds[0],
        userId: randomUUID(),
        role: "USER",
        createdAt: messageCreatedAt,
    });

    const completeMessages = await listMessagesForConversationOwner({
        orgId: trustedOrgId,
        userId: trustedUserId,
        conversationId: conversationIds[0],
        limit: 100,
    });
    const firstMessages = await listMessagesForConversationOwner({
        orgId: trustedOrgId,
        userId: trustedUserId,
        conversationId: conversationIds[0],
        limit: 2,
    });
    const secondMessages = await listMessagesForConversationOwner({
        orgId: trustedOrgId,
        userId: trustedUserId,
        conversationId: conversationIds[0],
        limit: 2,
        cursor: messageCursor.decodeMessageCursor(firstMessages.nextCursor),
    });
    assert.deepEqual(
        [...firstMessages.items, ...secondMessages.items].map((item) => item.messageId),
        completeMessages.items.map((item) => item.messageId),
    );

    const staleAdminPage = await listAdminLogs({
        orgId: trustedOrgId,
        limit: 2,
        cursor: { createdAt: new Date("2000-01-01T00:00:00.000Z"), id: randomUUID() },
    });
    const staleConversationPage = await listConversationsForOwner({
        orgId: trustedOrgId,
        userId: trustedUserId,
        limit: 2,
        cursor: { lastMessageAt: new Date("2000-01-01T00:00:00.000Z"), conversationId: randomUUID() },
    });
    const staleMessagePage = await listMessagesForConversationOwner({
        orgId: trustedOrgId,
        userId: trustedUserId,
        conversationId: conversationIds[0],
        limit: 2,
        cursor: { createdAt: new Date("2100-01-01T00:00:00.000Z"), messageId: randomUUID() },
    });
    assert.deepEqual(staleAdminPage.items, []);
    assert.deepEqual(staleConversationPage.items, []);
    assert.deepEqual(staleMessagePage.items, []);

    const foreignCursor = adminCursor.encodeAdminCursor({
        createdAt: new Date("2026-08-21T10:00:00.000Z"),
        id: randomUUID(),
    });
    const foreignScopedPage = await request(`/api/v1/admin/logs?limit=100&cursor=${foreignCursor}`);
    const foreignScopedBody = await foreignScopedPage.json();
    assert.equal(foreignScopedPage.status, 200);
    assert.equal(foreignScopedBody.data.items.length, 3);
    assert.equal(JSON.stringify(foreignScopedBody).includes(foreignOrgId), false);
});

test("HTTP boundaries return safe envelopes for invalid identifiers, queries, and JSON bodies", async () => {
    const ownedConversation = await ConversationModel.create({
        orgId: trustedOrgId,
        userId: trustedUserId,
    });
    const foreignConversation = await ConversationModel.create({
        orgId: foreignOrgId,
        userId: randomUUID(),
    });

    const cases = [
        ["/api/v1/conversations/not-a-uuid", 400, "VALIDATION_ERROR"],
        [`/api/v1/conversations/${randomUUID()}`, 404, "NOT_FOUND"],
        [`/api/v1/conversations/${foreignConversation.conversationId}`, 404, "NOT_FOUND"],
        ["/api/v1/conversations?limit=0", 400, "VALIDATION_ERROR"],
        ["/api/v1/conversations?limit=101", 400, "VALIDATION_ERROR"],
        ["/api/v1/conversations?limit=1&limit=2", 400, "VALIDATION_ERROR"],
        ["/api/v1/conversations?unsupported=value", 400, "VALIDATION_ERROR"],
        ["/api/v1/conversations?cursor=not-a-cursor", 400, "INVALID_CURSOR"],
        [`/api/v1/conversations/${ownedConversation.conversationId}/messages?cursor=not-a-cursor`, 400, "INVALID_CURSOR"],
        ["/api/v1/admin/logs?cursor=not-a-cursor", 400, "INVALID_CURSOR"],
        ["/api/v1/admin/logs?provider=unsupported", 400, "VALIDATION_ERROR"],
        ["/api/v1/admin/users?role=SUPER_ADMIN", 400, "VALIDATION_ERROR"],
        ["/api/v1/admin/teams?isActive=yes", 400, "VALIDATION_ERROR"],
    ];

    for (const [path, status, code] of cases) {
        const response = await request(path);
        const body = await response.json();
        assert.equal(response.status, status, path);
        assert.equal(body.success, false, path);
        assert.equal(body.error.code, code, path);
        assert.equal(body.error.requestId, response.headers.get("x-request-id"), path);
    }

    const malformed = await request("/api/v1/conversations", {
        body: "{",
        headers: { "Content-Type": "application/json" },
        method: "POST",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "INVALID_JSON");

    const oversized = await request("/api/v1/conversations", {
        body: JSON.stringify({ title: "x".repeat(1_048_576) }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error.code, "PAYLOAD_TOO_LARGE");
});

function createTestApp() {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json({ limit: "1mb" }));
    app.use((req, _res, next) => {
        req.auth = {
            orgId: trustedOrgId,
            userId: trustedUserId,
            role: "ORG_ADMIN",
            permissions: [
                "chat:send",
                "chat:view_own",
                "admin:view_logs",
                "admin:manage_users",
            ],
            sessionId: randomUUID(),
        };
        next();
    });
    app.get("/api/v1/conversations", conversationController.listConversations);
    app.post("/api/v1/conversations", conversationController.createConversation);
    app.get("/api/v1/conversations/:conversationId", conversationController.getConversation);
    app.get("/api/v1/conversations/:conversationId/messages", messageController.listConversationMessages);
    app.get("/api/v1/admin/logs", adminController.adminLogs);
    app.get("/api/v1/admin/alerts", adminController.adminAlerts);
    app.get("/api/v1/admin/users", adminController.adminUsers);
    app.get("/api/v1/admin/teams", adminController.adminTeams);
    app.use(globalErrorHandler);
    return app;
}

function request(path, options) {
    return fetch(`${origin}${path}`, options);
}

function requestLog(orgId, userId, createdAt) {
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
        createdAt,
    };
}

function user(orgId, userId, email, createdAt) {
    return {
        userId,
        orgId,
        email,
        passwordHash: "stored-hash",
        displayName: email.split("@")[0],
        role: "EMPLOYEE",
        permissions: ["chat:send", "chat:view_own"],
        status: "ACTIVE",
        createdAt,
        updatedAt: createdAt,
    };
}

function team(orgId, teamId, createdBy, name, createdAt) {
    return { orgId, teamId, createdBy, name, isActive: true, createdAt, updatedAt: createdAt };
}

function alert(orgId, userId, observedDay, createdAt) {
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
        createdAt,
        updatedAt: createdAt,
    };
}
