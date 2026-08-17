import { getConversationForOwner } from "../conversations/conversation.service.js";
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

    const messages = await repository.listForConversation({
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
    return {
        messageId: message.messageId,
        role: apiRoleByStoredRole[message.role],
        ...(message.tokenCount === undefined
            ? {}
            : {
                tokenCount: message.tokenCount,
            }),
        createdAt: message.createdAt,
        contentAvailable: false,
    };
}
