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
    process.env.CONVERSATION_QUERY_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_conversation_query_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Conversation query tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    { requirePermission },
    { getConversation, listConversations },
    { ConversationModel },
    { globalErrorHandler },
    { requestIdMiddleware },
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/auth/authorization.middleware.js"),
    import("../dist/features/conversations/conversation.controller.js"),
    import("../dist/features/conversations/conversation.model.js"),
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
        "/api/v1/conversations",
        requirePermission("chat:view_own"),
        listConversations,
    );
    testApp.get(
        "/api/v1/conversations/:conversationId",
        requirePermission("chat:view_own"),
        getConversation,
    );
    testApp.use(globalErrorHandler);

    return testApp;
}

function conversation(overrides = {}) {
    return {
        orgId: trustedOrgId,
        userId: trustedUserId,
        title: `Conversation ${randomUUID()}`,
        ...overrides,
    };
}

async function request(path) {
    return fetch(`${origin}${path}`);
}

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await ConversationModel.init();

    server = createTestApp().listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    origin = `http://127.0.0.1:${address.port}`;
});

test.beforeEach(async () => {
    await ConversationModel.deleteMany({});
});

test.after(async () => {
    server.close();
    await once(server, "close");
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("list returns only conversations owned by the trusted user", async () => {
    const owned = await ConversationModel.create([
        conversation({ title: "Owned first" }),
        conversation({ title: "Owned second" }),
    ]);
    await ConversationModel.create([
        conversation({ orgId: randomUUID(), title: "Foreign tenant" }),
        conversation({ userId: randomUUID(), title: "Foreign user" }),
    ]);

    const response = await request("/api/v1/conversations");
    const body = await response.json();
    const returnedIds = body.data.items.map((item) => item.conversationId);

    assert.equal(response.status, 200);
    assert.equal(body.data.items.length, 2);
    assert.deepEqual(
        returnedIds.sort(),
        owned.map((item) => item.conversationId).sort(),
    );
});

test("read returns an owned conversation", async () => {
    const owned = await ConversationModel.create(
        conversation({ title: "Owned conversation" }),
    );

    const response = await request(
        `/api/v1/conversations/${owned.conversationId}`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.conversationId, owned.conversationId);
    assert.equal(body.data.title, "Owned conversation");
    assert.equal(body.meta.requestId, response.headers.get("x-request-id"));
});

test("foreign tenant and foreign user conversation IDs return generic 404", async () => {
    const foreignTenant = await ConversationModel.create(
        conversation({ orgId: randomUUID() }),
    );
    const foreignUser = await ConversationModel.create(
        conversation({ userId: randomUUID() }),
    );

    for (const foreignConversation of [foreignTenant, foreignUser]) {
        const response = await request(
            `/api/v1/conversations/${foreignConversation.conversationId}`,
        );
        const body = await response.json();

        assert.equal(response.status, 404);
        assert.deepEqual(body.error, {
            code: "NOT_FOUND",
            message: "Conversation not found.",
            requestId: response.headers.get("x-request-id"),
        });
    }
});

test("cursor pagination returns stable non-overlapping pages", async () => {
    const dates = [
        new Date("2026-08-17T12:03:00.000Z"),
        new Date("2026-08-17T12:02:00.000Z"),
        new Date("2026-08-17T12:01:00.000Z"),
    ];
    const created = await ConversationModel.create(
        dates.map((lastMessageAt, index) => conversation({
            lastMessageAt,
            title: `Page item ${index + 1}`,
        })),
    );

    const firstResponse = await request("/api/v1/conversations?limit=2");
    const firstBody = await firstResponse.json();
    const secondResponse = await request(
        `/api/v1/conversations?limit=2&cursor=${encodeURIComponent(firstBody.meta.nextCursor)}`,
    );
    const secondBody = await secondResponse.json();

    assert.deepEqual(
        firstBody.data.items.map((item) => item.conversationId),
        [created[0].conversationId, created[1].conversationId],
    );
    assert.equal(typeof firstBody.meta.nextCursor, "string");
    assert.deepEqual(
        secondBody.data.items.map((item) => item.conversationId),
        [created[2].conversationId],
    );
    assert.equal(secondBody.meta.nextCursor, null);
});
