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
    const conversation = await repository.create({
        orgId: input.orgId,
        userId: input.userId,
        title: input.title ?? DEFAULT_CONVERSATION_TITLE,
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
        input.title,
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
        title: conversation.title,
        messageCount: conversation.messageCount,
        createdAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt,
    };
}
