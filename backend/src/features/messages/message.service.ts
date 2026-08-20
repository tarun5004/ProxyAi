import { randomUUID } from "node:crypto";

import mongoose from "mongoose";

import { AppError } from "../../shared/errors/app-error.js";
import {
    normalizeEncryptedPayload,
    requireEncryptionService,
    type EncryptedPayload,
} from "../../shared/security/encryption.js";
import { getConversationForOwner } from "../conversations/conversation.service.js";
import type { RetentionMode } from "../organisations/organisation.types.js";
import { encodeMessageCursor } from "./message.cursor.js";
import {
    messageRepository,
    type MessageRepository,
} from "./message.repository.js";
import type {
    ApiMessageRole,
    MessageDocument,
    MessageListCursor,
    MessagePage,
    MessageRole,
    SafeMessageSummary,
} from "./message.types.js";

const apiRoleByStoredRole: Readonly<Record<MessageRole, ApiMessageRole>> = {
    ASSISTANT: "assistant",
    SYSTEM: "system",
    USER: "user",
};

export async function listMessagesForConversationOwner(
    input: {
        orgId: string;
        userId: string;
        conversationId: string;
        limit: number;
        cursor?: MessageListCursor;
    },
    repository: MessageRepository = messageRepository,
): Promise<MessagePage> {
    await getConversationForOwner(
        input.orgId,
        input.userId,
        input.conversationId,
    );

    const messages = await repository.findRetainedForConversation({
        orgId: input.orgId,
        conversationId: input.conversationId,
        limit: input.limit,
        ...(input.cursor === undefined
            ? {}
            : {
                cursor: input.cursor,
            }),
    });
    const hasMore = messages.length > input.limit;
    const pageDocuments = hasMore
        ? messages.slice(0, input.limit)
        : messages;
    const items = pageDocuments.map(toSafeMessageSummary);
    const finalItem = items.at(-1);

    return {
        items,
        nextCursor:
            hasMore && finalItem
                ? encodeMessageCursor({
                    createdAt: finalItem.createdAt,
                    messageId: finalItem.messageId,
                })
                : null,
    };
}

function toSafeMessageSummary(
    message: MessageDocument,
): SafeMessageSummary {
    const content = message.contentEnc === undefined
        ? undefined
        : requireEncryptionService().decrypt(
            normalizeEncryptedPayload(message.contentEnc as EncryptedPayload),
            {
                orgId: message.orgId,
                entityType: "MESSAGE",
                entityId: message.messageId,
                fieldName: "content",
                conversationId: message.conversationId,
                messageId: message.messageId,
            },
        );

    return {
        messageId: message.messageId,
        role: apiRoleByStoredRole[message.role],
        ...(message.tokenCount === undefined
            ? {}
            : {
                tokenCount: message.tokenCount,
            }),
        createdAt: message.createdAt,
        contentAvailable: content !== undefined,
        ...(content === undefined ? {} : { content }),
    };
}

export interface PersistCompletedMessagePairInput {
    readonly orgId: string;
    readonly userId: string;
    readonly conversationId: string;
    readonly requestId: string;
    readonly retentionMode: RetentionMode;
    readonly userContent: string;
    readonly assistantContent: string;
    readonly inputTokenCount?: number;
    readonly outputTokenCount?: number;
    readonly occurredAt?: Date;
}

export async function persistCompletedMessagePair(
    input: PersistCompletedMessagePairInput,
    repository: MessageRepository = messageRepository,
): Promise<void> {
    const occurredAt = input.occurredAt ?? new Date();
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    const base = {
        orgId: input.orgId,
        userId: input.userId,
        conversationId: input.conversationId,
        requestId: input.requestId,
        createdAt: occurredAt,
    };
    const records = input.retentionMode === "METADATA_ONLY"
        ? [
            {
                ...base,
                messageId: userMessageId,
                role: "USER",
                contentStored: false,
                ...(input.inputTokenCount === undefined
                    ? {}
                    : { tokenCount: input.inputTokenCount }),
            },
            {
                ...base,
                messageId: assistantMessageId,
                role: "ASSISTANT",
                contentStored: false,
                ...(input.outputTokenCount === undefined
                    ? {}
                    : { tokenCount: input.outputTokenCount }),
            },
        ] as const
        : createEncryptedRecords(
            input,
            base,
            userMessageId,
            assistantMessageId,
        );
    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            const existingCount = await repository.countByRequest(
                input.orgId,
                input.requestId,
                session,
            );

            if (existingCount === 2) {
                return;
            }

            if (existingCount !== 0) {
                throw persistenceError();
            }

            await repository.createPair(records, session);
            const updated = await repository.incrementConversationActivity(
                {
                    orgId: input.orgId,
                    userId: input.userId,
                    conversationId: input.conversationId,
                    occurredAt,
                },
                session,
            );

            if (!updated) {
                throw new AppError(404, "NOT_FOUND", "Conversation not found.");
            }
        });
    } catch (error: unknown) {
        if (error instanceof AppError) {
            throw error;
        }

        throw persistenceError();
    } finally {
        await session.endSession();
    }
}

function createEncryptedRecords(
    input: PersistCompletedMessagePairInput,
    base: Record<string, unknown>,
    userMessageId: string,
    assistantMessageId: string,
): readonly [Record<string, unknown>, Record<string, unknown>] {
    const encryption = requireEncryptionService();

    return [
        {
            ...base,
            messageId: userMessageId,
            role: "USER",
            contentStored: true,
            contentEnc: encryption.encrypt(input.userContent, {
                orgId: input.orgId,
                entityType: "MESSAGE",
                entityId: userMessageId,
                fieldName: "content",
                conversationId: input.conversationId,
                messageId: userMessageId,
            }),
            ...(input.inputTokenCount === undefined
                ? {}
                : { tokenCount: input.inputTokenCount }),
        },
        {
            ...base,
            messageId: assistantMessageId,
            role: "ASSISTANT",
            contentStored: true,
            contentEnc: encryption.encrypt(input.assistantContent, {
                orgId: input.orgId,
                entityType: "MESSAGE",
                entityId: assistantMessageId,
                fieldName: "content",
                conversationId: input.conversationId,
                messageId: assistantMessageId,
            }),
            ...(input.outputTokenCount === undefined
                ? {}
                : { tokenCount: input.outputTokenCount }),
        },
    ];
}

function persistenceError(): AppError {
    return new AppError(
        503,
        "MESSAGE_PERSISTENCE_UNAVAILABLE",
        "Completed message persistence is temporarily unavailable.",
    );
}
