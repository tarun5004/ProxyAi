import { randomUUID } from "node:crypto";

import {
    normalizeEncryptedPayload,
    requireEncryptionService,
    type EncryptedPayload,
} from "../../shared/security/encryption.js";
import {
    conversationRepository,
    type ConversationRepository,
} from "./conversation.repository.js";
import { AppError } from "../../shared/errors/app-error.js";
import { encodeConversationCursor } from "./conversation.cursor.js";
import {
    DEFAULT_CONVERSATION_TITLE,
    type ConversationDocument,
    type ConversationPage,
    type ConversationSummary,
    type CreateConversationInput,
    type ListOwnedConversationsInput,
    type UpdateConversationTitleInput,
} from "./conversation.types.js";

export async function createConversationForOwner(
    input: CreateConversationInput,
    repository: ConversationRepository = conversationRepository,
): Promise<ConversationSummary> {
    const conversationId = randomUUID();
    const customTitle = input.title !== undefined
        && input.title !== DEFAULT_CONVERSATION_TITLE
        ? input.title
        : undefined;
    const conversation = await repository.create({
        conversationId,
        orgId: input.orgId,
        userId: input.userId,
        title: DEFAULT_CONVERSATION_TITLE,
        ...(customTitle === undefined
            ? {}
            : {
                titleEnc: encryptConversationTitle(
                    input.orgId,
                    conversationId,
                    customTitle,
                ),
            }),
    });

    return {
        ...toConversationSummary(conversation),
    };
}

export async function listConversationsForOwner(
    input: ListOwnedConversationsInput,
    repository: ConversationRepository = conversationRepository,
): Promise<ConversationPage> {
    const conversations = await repository.listOwned(input);
    const hasMore = conversations.length > input.limit;
    const pageDocuments = hasMore
        ? conversations.slice(0, input.limit)
        : conversations;
    const items = pageDocuments.map(toConversationSummary);
    const finalItem = items.at(-1);

    return {
        items,
        nextCursor:
            hasMore && finalItem
                ? encodeConversationCursor({
                    conversationId: finalItem.conversationId,
                    lastMessageAt: finalItem.lastMessageAt,
                })
                : null,
    };
}

export async function getConversationForOwner(
    orgId: string,
    userId: string,
    conversationId: string,
    repository: ConversationRepository = conversationRepository,
): Promise<ConversationSummary> {
    const conversation = await repository.findOwnedById(
        orgId,
        userId,
        conversationId,
    );

    if (!conversation) {
        throw new AppError(
            404,
            "NOT_FOUND",
            "Conversation not found.",
        );
    }

    return toConversationSummary(conversation);
}

export async function updateConversationTitleForOwner(
    input: UpdateConversationTitleInput,
    repository: ConversationRepository = conversationRepository,
): Promise<ConversationSummary> {
    const conversation = await repository.updateTitleOwned(
        input.orgId,
        input.userId,
        input.conversationId,
        DEFAULT_CONVERSATION_TITLE,
        input.title === DEFAULT_CONVERSATION_TITLE
            ? undefined
            : encryptConversationTitle(
                input.orgId,
                input.conversationId,
                input.title,
            ),
    );

    if (!conversation) {
        throw new AppError(
            404,
            "NOT_FOUND",
            "Conversation not found.",
        );
    }

    return toConversationSummary(conversation);
}

function toConversationSummary(
    conversation: ConversationDocument,
): ConversationSummary {
    return {
        conversationId: conversation.conversationId,
        title: decryptConversationTitle(conversation),
        messageCount: conversation.messageCount,
        createdAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt,
    };
}

function encryptConversationTitle(
    orgId: string,
    conversationId: string,
    title: string,
): EncryptedPayload {
    return requireEncryptionService().encrypt(title, {
        orgId,
        entityType: "CONVERSATION",
        entityId: conversationId,
        fieldName: "title",
        conversationId,
    });
}

function decryptConversationTitle(conversation: ConversationDocument): string {
    if (conversation.titleEnc === undefined) {
        return conversation.title;
    }

    return requireEncryptionService().decrypt(normalizeEncryptedPayload(
        conversation.titleEnc,
    ), {
        orgId: conversation.orgId,
        entityType: "CONVERSATION",
        entityId: conversation.conversationId,
        fieldName: "title",
        conversationId: conversation.conversationId,
    });
}
