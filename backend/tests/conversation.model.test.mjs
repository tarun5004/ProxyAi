import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const { ConversationModel } = await import(
    "../dist/features/conversations/conversation.model.js"
);

function validConversation(overrides = {}) {
    return {
        orgId: randomUUID(),
        userId: randomUUID(),
        ...overrides,
    };
}

async function assertValidationFailure(input, path) {
    await assert.rejects(
        new ConversationModel(input).validate(),
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
        document = new ConversationModel(input);
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

test("valid conversation receives approved defaults", async () => {
    const conversation = new ConversationModel(validConversation());

    await conversation.validate();

    assert.match(
        conversation.conversationId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(conversation.title, "New conversation");
    assert.equal(conversation.messageCount, 0);
    assert.equal(conversation.lastMessageAt, null);
});

test("tenant, owner, and public IDs are required immutable UUIDs", async () => {
    for (const path of ["orgId", "userId"]) {
        await assertValidationFailure(
            validConversation({
                [path]: undefined,
            }),
            path,
        );
        await assertValidationFailure(
            validConversation({
                [path]: "not-a-uuid",
            }),
            path,
        );
    }

    assert.equal(
        ConversationModel.schema.path("conversationId").options.immutable,
        true,
    );
    assert.equal(ConversationModel.schema.path("orgId").options.immutable, true);
    assert.equal(ConversationModel.schema.path("userId").options.immutable, true);
});

test("title and message count enforce approved constraints", async () => {
    await assertValidationFailure(
        validConversation({
            title: "   ",
        }),
        "title",
    );
    await assertValidationFailure(
        validConversation({
            title: "x".repeat(121),
        }),
        "title",
    );
    await assertValidationFailure(
        validConversation({
            messageCount: -1,
        }),
        "messageCount",
    );
    await assertValidationFailure(
        validConversation({
            messageCount: 1.5,
        }),
        "messageCount",
    );
});

test("schema rejects unknown fields and declares only approved indexes", async () => {
    await assertStrictFailure(
        validConversation({
            status: "ACTIVE",
        }),
    );

    assert.equal(
        ConversationModel.collection.collectionName,
        "conversations",
    );
    assert.notEqual(ConversationModel.schema.path("createdAt"), undefined);
    assert.notEqual(ConversationModel.schema.path("updatedAt"), undefined);
    assert.deepEqual(
        ConversationModel.schema.indexes(),
        [
            [
                {
                    conversationId: 1,
                },
                {
                    name: "uniq_conversations_conversation_id",
                    unique: true,
                },
            ],
            [
                {
                    orgId: 1,
                    userId: 1,
                    lastMessageAt: -1,
                },
                {
                    name: "idx_conversations_org_user_last_message",
                },
            ],
        ],
    );
});
