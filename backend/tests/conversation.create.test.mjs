import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import express from "express";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const [
    { requirePermission },
    { createConversationHandler },
    { createConversationForOwner },
    { globalErrorHandler },
    { requestIdMiddleware },
] = await Promise.all([
    import("../dist/features/auth/authorization.middleware.js"),
    import("../dist/features/conversations/conversation.controller.js"),
    import("../dist/features/conversations/conversation.service.js"),
    import("../dist/shared/middleware/error.middleware.js"),
    import("../dist/shared/middleware/request-id.middleware.js"),
]);

const trustedOrgId = randomUUID();
const trustedUserId = randomUUID();

function createRepository(records) {
    return {
        async create(input) {
            records.push(input);

            return {
                conversationId: randomUUID(),
                orgId: input.orgId,
                userId: input.userId,
                title: input.title,
                messageCount: 0,
                lastMessageAt: null,
                createdAt: new Date("2026-08-17T12:00:00.000Z"),
                updatedAt: new Date("2026-08-17T12:00:00.000Z"),
            };
        },
    };
}

function createTestApp({ authenticated = true, records = [] } = {}) {
    const testApp = express();
    const repository = createRepository(records);
    const handler = createConversationHandler(
        (input) => createConversationForOwner(input, repository),
    );

    testApp.use(requestIdMiddleware);
    testApp.use(express.json());
    testApp.post(
        "/api/v1/conversations",
        (request, _response, next) => {
            if (authenticated) {
                request.auth = {
                    orgId: trustedOrgId,
                    userId: trustedUserId,
                    role: "EMPLOYEE",
                    permissions: ["chat:send"],
                    sessionId: randomUUID(),
                };
            }

            next();
        },
        requirePermission("chat:send"),
        handler,
    );
    testApp.use(globalErrorHandler);

    return testApp;
}

async function postConversation(application, body) {
    const server = application.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    try {
        return await fetch(
            `http://127.0.0.1:${address.port}/api/v1/conversations`,
            {
                body: JSON.stringify(body),
                headers: {
                    "Content-Type": "application/json",
                },
                method: "POST",
            },
        );
    } finally {
        server.close();
        await once(server, "close");
    }
}

test("creates a conversation for the trusted authenticated owner", async () => {
    const records = [];
    const response = await postConversation(
        createTestApp({ records }),
        {
            title: "  Architecture review  ",
        },
    );
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.title, "Architecture review");
    assert.equal(body.data.messageCount, 0);
    assert.equal(body.data.lastMessageAt, null);
    assert.equal(body.meta.requestId, response.headers.get("x-request-id"));
    assert.deepEqual(records, [
        {
            orgId: trustedOrgId,
            userId: trustedUserId,
            title: "Architecture review",
        },
    ]);
});

test("rejects client-controlled organisation and user ownership", async () => {
    const records = [];
    const response = await postConversation(
        createTestApp({ records }),
        {
            orgId: randomUUID(),
            title: "Unsafe ownership attempt",
            userId: randomUUID(),
        },
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.deepEqual(records, []);
});

test("uses the approved default title when title is omitted", async () => {
    const records = [];
    const response = await postConversation(
        createTestApp({ records }),
        {},
    );
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.title, "New conversation");
    assert.equal(records[0]?.title, "New conversation");
});

test("requires authenticated context", async () => {
    const records = [];
    const response = await postConversation(
        createTestApp({
            authenticated: false,
            records,
        }),
        {},
    );
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error.code, "UNAUTHORIZED");
    assert.deepEqual(records, []);
});
