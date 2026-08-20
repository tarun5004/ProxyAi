import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI = process.env.PHASE9_MESSAGE_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_phase9_message_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [
    mongooseModule,
    mongoModule,
    encryptionModule,
    conversationModelModule,
    messageModelModule,
    messageServiceModule,
    migrationModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/shared/security/encryption.js"),
    import("../dist/features/conversations/conversation.model.js"),
    import("../dist/features/messages/message.model.js"),
    import("../dist/features/messages/message.service.js"),
    import("../dist/scripts/migrate-phase9.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { initializeEncryption, requireEncryptionService } = encryptionModule;
const { ConversationModel } = conversationModelModule;
const { MessageModel } = messageModelModule;
const {
    listMessagesForConversationOwner,
    persistCompletedMessagePair,
} = messageServiceModule;
const { runPhase9Migration } = migrationModule;
let transactionsAvailable = false;

test.before(async () => {
    initializeEncryption();
    await connectMongo();
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsAvailable = typeof hello.setName === "string" || hello.msg === "isdbgrid";
});

test.beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([
        ConversationModel.createIndexes(),
        MessageModel.createIndexes(),
    ]);
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("METADATA_ONLY persists metadata without content and updates conversation activity", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createConversation();

    await persistCompletedMessagePair({
        ...fixture,
        requestId: randomUUID(),
        retentionMode: "METADATA_ONLY",
        userContent: "private user content",
        assistantContent: "private assistant content",
        inputTokenCount: 4,
        outputTokenCount: 6,
    });

    const stored = await MessageModel.find({ orgId: fixture.orgId }).select("+contentEnc").lean();
    const conversation = await ConversationModel.findOne({ conversationId: fixture.conversationId }).lean();

    assert.equal(stored.length, 2);
    assert.ok(stored.every((message) => message.contentStored === false && message.contentEnc === undefined));
    assert.equal(conversation?.messageCount, 2);
    assert.ok(conversation?.lastMessageAt instanceof Date);
});

test("ENCRYPTED_STORAGE stores ciphertext only and owner reads decrypted content", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createConversation();
    const userContent = "owner secret prompt";
    const assistantContent = "owner secret response";

    await persistCompletedMessagePair({
        ...fixture,
        requestId: randomUUID(),
        retentionMode: "ENCRYPTED_STORAGE",
        userContent,
        assistantContent,
    });

    const stored = await MessageModel.find({ orgId: fixture.orgId }).select("+contentEnc").sort({ createdAt: 1 }).exec();
    const page = await listMessagesForConversationOwner({ ...fixture, limit: 10 });
    const serialized = JSON.stringify(stored.map((message) => message.toJSON()));

    assert.equal(page.items[0]?.content, userContent);
    assert.equal(page.items[1]?.content, assistantContent);
    assert.ok(stored.every((message) => message.contentStored && message.contentEnc !== undefined));
    assert.ok(stored.every((message) => message.contentEnc?.ciphertext !== userContent && message.contentEnc?.ciphertext !== assistantContent));
    assert.doesNotMatch(serialized, /contentEnc|ciphertext|authTag|owner secret/);
});

test("foreign tenant or user cannot read retained message content", async (context) => {
    if (!transactionsAvailable) return context.skip("MongoDB transactions require a replica set.");
    const fixture = await createConversation();
    await persistCompletedMessagePair({
        ...fixture,
        requestId: randomUUID(),
        retentionMode: "ENCRYPTED_STORAGE",
        userContent: "tenant sentinel",
        assistantContent: "assistant sentinel",
    });

    await assert.rejects(
        listMessagesForConversationOwner({
            ...fixture,
            orgId: randomUUID(),
            limit: 10,
        }),
        (error) => error.statusCode === 404 && error.code === "NOT_FOUND",
    );
    await assert.rejects(
        listMessagesForConversationOwner({
            ...fixture,
            userId: randomUUID(),
            limit: 10,
        }),
        (error) => error.statusCode === 404 && error.code === "NOT_FOUND",
    );
});

test("title migration verifies before replacement and is idempotent", async () => {
    const fixture = await createConversation("Legacy private title");
    const failingEncryption = {
        encrypt() {
            return {
                algorithm: "AES-256-GCM",
                ciphertext: "AA",
                iv: "AAAAAAAAAAAAAAAA",
                authTag: "AAAAAAAAAAAAAAAAAAAAAA",
                keyVersion: 1,
            };
        },
        decrypt() {
            throw new Error("verification failed");
        },
    };

    await assert.rejects(runPhase9Migration(failingEncryption), /verification failed/);
    const unchanged = await ConversationModel.findOne({ conversationId: fixture.conversationId }).select("+titleEnc").lean();
    assert.equal(unchanged?.title, "Legacy private title");
    assert.equal(unchanged?.titleEnc, undefined);

    const first = await runPhase9Migration(requireEncryptionService());
    const second = await runPhase9Migration(requireEncryptionService());
    const migrated = await ConversationModel.findOne({ conversationId: fixture.conversationId }).select("+titleEnc").lean();

    assert.equal(first.migratedTitles, 1);
    assert.equal(second.migratedTitles, 0);
    assert.equal(migrated?.title, "New conversation");
    assert.ok(migrated?.titleEnc !== undefined);
});

async function createConversation(title = "New conversation") {
    const orgId = randomUUID();
    const userId = randomUUID();
    const conversationId = randomUUID();
    await ConversationModel.create({ orgId, userId, conversationId, title });
    return { orgId, userId, conversationId };
}
