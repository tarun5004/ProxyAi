import { MessageModel } from "./message.model.js";
import type {
    MessageDocument,
    MessageListCursor,
} from "./message.types.js";

export interface MessageRepository {
    listForConversation(input: {
        orgId: string;
        conversationId: string;
        limit: number;
        cursor?: MessageListCursor;
    }): Promise<MessageDocument[]>;
}

export const messageRepository: MessageRepository = {
    async listForConversation(input) {
        return MessageModel.find({
            orgId: input.orgId,
            conversationId: input.conversationId,
            ...createCursorFilter(input.cursor),
        })
            .select({
                _id: 0,
                createdAt: 1,
                messageId: 1,
                role: 1,
                tokenCount: 1,
            })
            .sort({
                createdAt: 1,
                messageId: 1,
            })
            .limit(input.limit + 1)
            .exec();
    },
};

function createCursorFilter(
    cursor: MessageListCursor | undefined,
): Record<string, unknown> {
    if (!cursor) {
        return {};
    }

    return {
        $or: [
            {
                createdAt: {
                    $gt: cursor.createdAt,
                },
            },
            {
                createdAt: cursor.createdAt,
                messageId: {
                    $gt: cursor.messageId,
                },
            },
        ],
    };
}
