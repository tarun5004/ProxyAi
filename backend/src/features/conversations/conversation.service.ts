import {
    conversationRepository,
    type ConversationRepository,
} from "./conversation.repository.js";
import {
    DEFAULT_CONVERSATION_TITLE,
    type ConversationSummary,
    type CreateConversationInput,
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
        conversationId: conversation.conversationId,
        title: conversation.title,
        messageCount: conversation.messageCount,
        createdAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt,
    };
}
