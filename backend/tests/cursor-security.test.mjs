import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const {
    decodeAdminCursor,
    encodeAdminCursor,
} = await import("../dist/features/admin/admin.cursor.js");
const {
    decodeConversationCursor,
    encodeConversationCursor,
} = await import("../dist/features/conversations/conversation.cursor.js");
const {
    decodeMessageCursor,
    encodeMessageCursor,
} = await import("../dist/features/messages/message.cursor.js");

const createdAt = new Date("2026-08-21T10:00:00.000Z");

test("opaque cursors roundtrip only approved stable sort fields", () => {
    const conversationId = randomUUID();
    const messageId = randomUUID();

    assert.deepEqual(decodeAdminCursor(encodeAdminCursor({ createdAt, id: messageId })), {
        createdAt,
        id: messageId,
    });
    assert.deepEqual(decodeConversationCursor(encodeConversationCursor({
        conversationId,
        lastMessageAt: createdAt,
    })), {
        conversationId,
        lastMessageAt: createdAt,
    });
    assert.deepEqual(decodeConversationCursor(encodeConversationCursor({
        conversationId,
        lastMessageAt: null,
    })), {
        conversationId,
        lastMessageAt: null,
    });
    assert.deepEqual(decodeMessageCursor(encodeMessageCursor({ createdAt, messageId })), {
        createdAt,
        messageId,
    });
});

test("malformed and extended cursors fail with canonical safe errors", () => {
    const invalidCursors = [
        "not-base64-json",
        Buffer.from(JSON.stringify({ createdAt: "invalid", id: "row" })).toString("base64url"),
        Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id: "row", orgId: randomUUID() })).toString("base64url"),
    ];

    for (const cursor of invalidCursors) {
        assert.throws(
            () => decodeAdminCursor(cursor),
            (error) => error.statusCode === 400 && error.code === "INVALID_CURSOR",
        );
    }
    assert.throws(
        () => decodeConversationCursor(invalidCursors[0]),
        (error) => error.statusCode === 400 && error.code === "INVALID_CURSOR",
    );
    assert.throws(
        () => decodeMessageCursor(invalidCursors[0]),
        (error) => error.statusCode === 400 && error.code === "INVALID_CURSOR",
    );
});
