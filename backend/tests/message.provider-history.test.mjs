import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();

const { initializeEncryption, requireEncryptionService } = await import(
    "../dist/shared/security/encryption.js"
);
const { MessageModel } = await import(
    "../dist/features/messages/message.model.js"
);
const { loadRecentProviderHistory } = await import(
    "../dist/features/messages/message.service.js"
);

initializeEncryption();

test("provider history decrypts only the trusted owner-scoped query", async () => {
    const orgId = randomUUID();
    const userId = randomUUID();
    const conversationId = randomUUID();
    const requestId = randomUUID();
    const encryption = requireEncryptionService();
    const userMessage = createEncryptedMessage({
        orgId,
        userId,
        conversationId,
        requestId,
        role: "USER",
        content: "Remember the deployment checklist.",
        encryption,
    });
    const assistantMessage = createEncryptedMessage({
        orgId,
        userId,
        conversationId,
        requestId,
        role: "ASSISTANT",
        content: "The checklist is ready.",
        encryption,
    });
    const repository = {
        async findRecentRetainedForOwner(input) {
            assert.deepEqual(input, {
                orgId,
                userId,
                conversationId,
                limit: 20,
            });

            // The repository returns newest first; the service restores chat order.
            return [assistantMessage, userMessage];
        },
    };

    const history = await loadRecentProviderHistory({
        orgId,
        userId,
        conversationId,
    }, repository);

    assert.deepEqual(history, [{
        requestId,
        role: "user",
        content: "Remember the deployment checklist.",
    }, {
        requestId,
        role: "assistant",
        content: "The checklist is ready.",
    }]);
});

test("provider history reports a safe error instead of returning partial content", async () => {
    const input = {
        orgId: randomUUID(),
        userId: randomUUID(),
        conversationId: randomUUID(),
    };

    await assert.rejects(
        loadRecentProviderHistory(input, {
            async findRecentRetainedForOwner() {
                throw new Error("connection details must stay private");
            },
        }),
        (error) => error?.statusCode === 503
            && error?.code === "MESSAGE_HISTORY_UNAVAILABLE"
            && error?.message === "Conversation memory is temporarily unavailable.",
    );
});

function createEncryptedMessage(input) {
    const messageId = randomUUID();

    return new MessageModel({
        messageId,
        orgId: input.orgId,
        userId: input.userId,
        conversationId: input.conversationId,
        requestId: input.requestId,
        role: input.role,
        contentStored: true,
        contentEnc: input.encryption.encrypt(input.content, {
            orgId: input.orgId,
            entityType: "MESSAGE",
            entityId: messageId,
            fieldName: "content",
            conversationId: input.conversationId,
            messageId,
        }),
        createdAt: new Date(),
    });
}
