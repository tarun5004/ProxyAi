import { MessageModel } from "./message.model.js";
import { ConversationModel } from "../conversations/conversation.model.js";
import type { ClientSession } from "mongoose";
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
    findRetainedForConversation(input: {
        orgId: string;
        conversationId: string;
        limit: number;
        cursor?: MessageListCursor;
    }): Promise<MessageDocument[]>;
    findRecentRetainedForOwner(input: {
        orgId: string;
        userId: string;
        conversationId: string;
        limit: number;
    }): Promise<MessageDocument[]>;
    countByRequest(
        orgId: string,
        requestId: string,
        session: ClientSession,
    ): Promise<number>;
    createPair(
        records: readonly [Record<string, unknown>, Record<string, unknown>],
        session: ClientSession,
    ): Promise<void>;
    incrementConversationActivity(
        input: {
            orgId: string;
            userId: string;
            conversationId: string;
            occurredAt: Date;
        },
        session: ClientSession,
    ): Promise<boolean>;
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
    async findRetainedForConversation(input) {
        return MessageModel.find({
            orgId: input.orgId,
            conversationId: input.conversationId,
            ...createCursorFilter(input.cursor),
        })
            .select("+contentEnc")
            .sort({ createdAt: 1, messageId: 1 })
            .limit(input.limit + 1)
            .exec();
    },
    async findRecentRetainedForOwner(input) {
        return MessageModel.find({
            orgId: input.orgId,
            userId: input.userId,
            conversationId: input.conversationId,
            contentStored: true,
            role: { $in: ["USER", "ASSISTANT"] },
        })
            .select("+contentEnc")
            .sort({ createdAt: -1, messageId: -1 })
            .limit(input.limit)
            .exec();
    },
    async countByRequest(orgId, requestId, session) {
        return MessageModel.countDocuments({ orgId, requestId })
            .session(session)
            .exec();
    },
    async createPair(records, session) {
        await MessageModel.create([...records], { ordered: true, session });
    },
    async incrementConversationActivity(input, session) {
        const result = await ConversationModel.updateOne(
            {
                orgId: input.orgId,
                userId: input.userId,
                conversationId: input.conversationId,
            },
            {
                $inc: { messageCount: 2 },
                $set: { lastMessageAt: input.occurredAt },
            },
            { session, runValidators: true },
        ).exec();

        return result.matchedCount === 1;
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
