import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import express from "express";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI =
    process.env.MESSAGE_QUERY_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_message_query_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Message query tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    { requirePermission },
    { ConversationModel },
    { listConversationMessages },
    { MessageModel },
    { globalErrorHandler },
    { requestIdMiddleware },
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/auth/authorization.middleware.js"),
    import("../dist/features/conversations/conversation.model.js"),
    import("../dist/features/messages/message.controller.js"),
    import("../dist/features/messages/message.model.js"),
    import("../dist/shared/middleware/error.middleware.js"),
    import("../dist/shared/middleware/request-id.middleware.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const trustedOrgId = randomUUID();
const trustedUserId = randomUUID();
let server;
let origin;

function createTestApp() {
    const testApp = express();

    testApp.use(requestIdMiddleware);
    testApp.use((request, _response, next) => {
        request.auth = {
            orgId: trustedOrgId,
            userId: trustedUserId,
            role: "EMPLOYEE",
            permissions: ["chat:view_own"],
            sessionId: randomUUID(),
        };
        next();
    });
    testApp.get(
        "/api/v1/conversations/:conversationId/messages",
        requirePermission("chat:view_own"),
        listConversationMessages,
    );
    testApp.use(globalErrorHandler);

    return testApp;
}

async function createConversation(overrides = {}) {
    return ConversationModel.create({
        orgId: trustedOrgId,
        userId: trustedUserId,
        ...overrides,
    });
}

async function createMessage(conversationId, overrides = {}) {
    return MessageModel.create({
        orgId: trustedOrgId,
        conversationId,
        userId: trustedUserId,
        role: "USER",
        ...overrides,
    });
}

async function request(conversationId, query = "") {
    return fetch(
        `${origin}/api/v1/conversations/${conversationId}/messages${query}`,
    );
}

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        ConversationModel.init(),
        MessageModel.init(),
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
    ]);
});

test.after(async () => {
    server.close();
    await once(server, "close");
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("owner receives safe lowercase message summaries", async () => {
    const conversation = await createConversation();
    await createMessage(conversation.conversationId, {
        role: "ASSISTANT",
        tokenCount: 12,
    });

    const response = await request(conversation.conversationId);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body.data.items[0]).sort(), [
        "contentAvailable",
        "createdAt",
        "messageId",
        "role",
        "tokenCount",
    ]);
    assert.equal(body.data.items[0].role, "assistant");
    assert.equal(body.data.items[0].contentAvailable, false);
    assert.equal(JSON.stringify(body).includes("contentEnc"), false);
});

test("foreign tenant and foreign user conversations return generic 404", async () => {
    const foreignTenant = await createConversation({
        orgId: randomUUID(),
    });
    const foreignUser = await createConversation({
        userId: randomUUID(),
    });

    for (const conversation of [foreignTenant, foreignUser]) {
        const response = await request(conversation.conversationId);
        const body = await response.json();

        assert.equal(response.status, 404);
        assert.equal(body.error.code, "NOT_FOUND");
        assert.equal(body.error.message, "Conversation not found.");
    }
});

test("messages cannot leak across conversations or tenants", async () => {
    const ownedConversation = await createConversation();
    const otherConversation = await createConversation();
    const ownedMessage = await createMessage(ownedConversation.conversationId);
    await createMessage(otherConversation.conversationId);
    await createMessage(ownedConversation.conversationId, {
        orgId: randomUUID(),
    });

    const response = await request(ownedConversation.conversationId);
    const body = await response.json();

    assert.deepEqual(
        body.data.items.map((item) => item.messageId),
        [ownedMessage.messageId],
    );
});

test("cursor pagination preserves chronological order", async () => {
    const conversation = await createConversation();
    const createdAtValues = [
        new Date("2026-08-18T10:01:00.000Z"),
        new Date("2026-08-18T10:02:00.000Z"),
        new Date("2026-08-18T10:03:00.000Z"),
    ];
    const messages = [];

    for (const [index, createdAt] of createdAtValues.entries()) {
        messages.push(await createMessage(conversation.conversationId, {
            createdAt,
            role: index === 1 ? "ASSISTANT" : "USER",
        }));
    }

    const firstResponse = await request(conversation.conversationId, "?limit=2");
    const firstBody = await firstResponse.json();
    const secondResponse = await request(
        conversation.conversationId,
        `?limit=2&cursor=${encodeURIComponent(firstBody.meta.nextCursor)}`,
    );
    const secondBody = await secondResponse.json();

    assert.deepEqual(
        firstBody.data.items.map((item) => item.messageId),
        [messages[0].messageId, messages[1].messageId],
    );
    assert.deepEqual(
        secondBody.data.items.map((item) => item.messageId),
        [messages[2].messageId],
    );
    assert.equal(secondBody.meta.nextCursor, null);
});
