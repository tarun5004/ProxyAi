import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const { MessageModel } = await import(
    "../dist/features/messages/message.model.js"
);

function validMessage(overrides = {}) {
    return {
        orgId: randomUUID(),
        conversationId: randomUUID(),
        userId: randomUUID(),
        role: "USER",
        ...overrides,
    };
}

async function assertValidationFailure(input, path) {
    await assert.rejects(
        new MessageModel(input).validate(),
        (error) => {
            assert.equal(error?.name, "ValidationError");
            assert.notEqual(error?.errors?.[path], undefined);
            return true;
        },
    );
}

async function assertStrictFailure(input) {
    let document;

    try {
        document = new MessageModel(input);
    } catch (error) {
        assert.match(
            String(error),
            /StrictModeError|strict mode is set to throw/i,
        );
        return;
    }

    await assert.rejects(
        document.validate(),
        /StrictModeError|strict mode is set to throw/i,
    );
}

test("valid metadata and encrypted messages use safe storage defaults", async () => {
    const metadataMessage = new MessageModel(validMessage());
    const encryptedMessage = new MessageModel(
        validMessage({
            contentStored: true,
            contentEnc: {
                ciphertext: "ciphertext",
                iv: "initialization-vector",
                authTag: "authentication-tag",
                keyVersion: 1,
            },
        }),
    );

    await metadataMessage.validate();
    await encryptedMessage.validate();

    assert.match(
        metadataMessage.messageId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(metadataMessage.contentStored, false);
    assert.equal(metadataMessage.contentEnc, undefined);
    assert.equal("contentEnc" in encryptedMessage.toJSON(), false);
    assert.equal("content" in encryptedMessage.toJSON(), false);

    await assertValidationFailure(
        validMessage({
            contentStored: true,
        }),
        "contentStored",
    );
});

test("tenant, conversation, owner, and public IDs are immutable UUIDs", async () => {
    for (const path of ["orgId", "conversationId", "userId"]) {
        await assertValidationFailure(
            validMessage({
                [path]: undefined,
            }),
            path,
        );
        await assertValidationFailure(
            validMessage({
                [path]: "not-a-uuid",
            }),
            path,
        );
    }

    for (const path of ["messageId", "orgId", "conversationId", "userId"]) {
        assert.equal(MessageModel.schema.path(path).options.immutable, true);
    }
});

test("role and token count accept only approved values", async () => {
    for (const role of ["USER", "ASSISTANT", "SYSTEM"]) {
        await new MessageModel(validMessage({ role })).validate();
    }

    await assertValidationFailure(
        validMessage({
            role: "user",
        }),
        "role",
    );
    await assertValidationFailure(
        validMessage({
            tokenCount: -1,
        }),
        "tokenCount",
    );
    await assertValidationFailure(
        validMessage({
            tokenCount: 1.5,
        }),
        "tokenCount",
    );
});

test("schema rejects unknown fields and declares only approved indexes", async () => {
    await assertStrictFailure(
        validMessage({
            content: "plaintext is forbidden",
        }),
    );
    await assertStrictFailure(
        validMessage({
            contentStored: true,
            contentEnc: {
                ciphertext: "ciphertext",
                iv: "initialization-vector",
                authTag: "authentication-tag",
                keyVersion: 1,
                algorithm: "unknown",
            },
        }),
    );

    assert.equal(MessageModel.collection.collectionName, "messages");
    assert.notEqual(MessageModel.schema.path("createdAt"), undefined);
    assert.equal(MessageModel.schema.path("updatedAt"), undefined);
    assert.deepEqual(
        MessageModel.schema.indexes(),
        [
            [
                {
                    messageId: 1,
                },
                {
                    name: "uniq_messages_message_id",
                    unique: true,
                },
            ],
            [
                {
                    orgId: 1,
                    conversationId: 1,
                    createdAt: 1,
                },
                {
                    name: "idx_messages_org_conversation_created",
                },
            ],
        ],
    );
});
