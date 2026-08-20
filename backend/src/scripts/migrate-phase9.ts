import { pathToFileURL } from "node:url";

import { ConversationModel } from "../features/conversations/conversation.model.js";
import { DEFAULT_CONVERSATION_TITLE } from "../features/conversations/conversation.types.js";
import { MessageModel } from "../features/messages/message.model.js";
import { logger } from "../shared/lib/logger.js";
import { connectMongo, disconnectMongo } from "../shared/lib/mongo.js";
import {
    initializeEncryption,
    normalizeEncryptedPayload,
    requireEncryptionService,
    type EncryptedPayload,
    type EncryptionService,
} from "../shared/security/encryption.js";

export async function runPhase9Migration(
    encryption: EncryptionService = requireEncryptionService(),
): Promise<{
    readonly verifiedMessages: number;
    readonly migratedTitles: number;
}> {
    const retainedMessages = await MessageModel.find({ contentStored: true })
        .select("+contentEnc")
        .exec();

    for (const message of retainedMessages) {
        if (message.contentEnc === undefined) {
            throw new Error("Phase 9 message preflight failed.");
        }
        encryption.decrypt(normalizeEncryptedPayload(
            message.contentEnc as EncryptedPayload,
        ), {
            orgId: message.orgId,
            entityType: "MESSAGE",
            entityId: message.messageId,
            fieldName: "content",
            conversationId: message.conversationId,
            messageId: message.messageId,
        });
    }

    const conversations = await ConversationModel.find({
        title: { $ne: DEFAULT_CONVERSATION_TITLE },
        titleEnc: { $exists: false },
    }).select("+titleEnc").exec();
    let migratedTitles = 0;

    for (const conversation of conversations) {
        const originalTitle = conversation.title;
        const context = {
            orgId: conversation.orgId,
            entityType: "CONVERSATION" as const,
            entityId: conversation.conversationId,
            fieldName: "title" as const,
            conversationId: conversation.conversationId,
        };
        const titleEnc = encryption.encrypt(originalTitle, context);

        if (encryption.decrypt(titleEnc, context) !== originalTitle) {
            throw new Error("Phase 9 title migration verification failed.");
        }

        const result = await ConversationModel.updateOne(
            {
                orgId: conversation.orgId,
                userId: conversation.userId,
                conversationId: conversation.conversationId,
                title: originalTitle,
                titleEnc: { $exists: false },
            },
            {
                $set: {
                    title: DEFAULT_CONVERSATION_TITLE,
                    titleEnc,
                },
            },
            { runValidators: true },
        ).exec();
        migratedTitles += result.modifiedCount;
    }

    return {
        verifiedMessages: retainedMessages.length,
        migratedTitles,
    };
}

async function main(): Promise<void> {
    try {
        initializeEncryption();
        await connectMongo();
        const result = await runPhase9Migration();
        logger.info({
            event: "phase9.migration.completed",
            migratedTitles: result.migratedTitles,
            verifiedMessages: result.verifiedMessages,
        }, "Phase 9 migration completed");
    } catch {
        process.exitCode = 1;
        logger.error({
            event: "phase9.migration.failed",
            errorCode: "PHASE9_MIGRATION_FAILED",
        }, "Phase 9 migration failed");
    } finally {
        await disconnectMongo().catch(() => {
            process.exitCode = 1;
        });
    }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
