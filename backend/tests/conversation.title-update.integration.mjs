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
    process.env.CONVERSATION_TITLE_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_conversation_title_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Conversation title tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    { requirePermission },
    { updateConversationTitle },
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
    testApp.use(express.json());
    testApp.use((request, _response, next) => {
        request.auth = {
            orgId: trustedOrgId,
            userId: trustedUserId,
            role: "EMPLOYEE",
            permissions: ["chat:send"],
            sessionId: randomUUID(),
        };
        next();
    });
    testApp.patch(
        "/api/v1/conversations/:conversationId",
        requirePermission("chat:send"),
        updateConversationTitle,
    );
    testApp.use(globalErrorHandler);

    return testApp;
}

async function patchTitle(conversationId, body) {
    return fetch(`${origin}/api/v1/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
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

test("renames an owned conversation with a strict trimmed title", async () => {
    const conversation = await ConversationModel.create({
        orgId: trustedOrgId,
        userId: trustedUserId,
        title: "Original title",
    });

    const response = await patchTitle(conversation.conversationId, {
        title: "  Updated title  ",
    });
    const body = await response.json();
    const stored = await ConversationModel.findOne({
        conversationId: conversation.conversationId,
    }).lean();

    assert.equal(response.status, 200);
    assert.equal(body.data.title, "Updated title");
    assert.equal(body.meta.requestId, response.headers.get("x-request-id"));
    assert.equal(stored?.title, "Updated title");

    const invalidResponse = await patchTitle(conversation.conversationId, {
        title: "Rejected",
        orgId: randomUUID(),
    });
    assert.equal(invalidResponse.status, 400);
});

test("returns generic 404 without updating foreign tenant or user records", async () => {
    const foreignConversations = await ConversationModel.create([
        {
            orgId: randomUUID(),
            userId: trustedUserId,
            title: "Foreign tenant",
        },
        {
            orgId: trustedOrgId,
            userId: randomUUID(),
            title: "Foreign user",
        },
    ]);

    for (const conversation of foreignConversations) {
        const response = await patchTitle(conversation.conversationId, {
            title: "Unauthorized update",
        });
        const body = await response.json();
        const stored = await ConversationModel.findOne({
            conversationId: conversation.conversationId,
        }).lean();

        assert.equal(response.status, 404);
        assert.deepEqual(body.error, {
            code: "NOT_FOUND",
            message: "Conversation not found.",
            requestId: response.headers.get("x-request-id"),
        });
        assert.notEqual(stored?.title, "Unauthorized update");
    }
});
