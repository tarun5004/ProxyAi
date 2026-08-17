import { ConversationModel } from "./conversation.model.js";
import type {
    ConversationDocument,
    ConversationListCursor,
} from "./conversation.types.js";

export interface NewConversationRecord {
    readonly orgId: string;
    readonly userId: string;
    readonly title: string;
}

export interface ConversationRepository {
    create(input: NewConversationRecord): Promise<ConversationDocument>;
    findOwnedById(
        orgId: string,
        userId: string,
        conversationId: string,
    ): Promise<ConversationDocument | null>;
    listOwned(input: {
        orgId: string;
        userId: string;
        limit: number;
        cursor?: ConversationListCursor;
    }): Promise<ConversationDocument[]>;
}

export const conversationRepository: ConversationRepository = {
    async create(input) {
        return ConversationModel.create(input);
    },
    async findOwnedById(orgId, userId, conversationId) {
        return ConversationModel.findOne({
            orgId,
            userId,
            conversationId,
        }).exec();
    },
    async listOwned(input) {
        return ConversationModel.find({
            orgId: input.orgId,
            userId: input.userId,
            ...createCursorFilter(input.cursor),
        })
            .sort({
                lastMessageAt: -1,
                conversationId: -1,
            })
            .limit(input.limit + 1)
            .exec();
    },
};

function createCursorFilter(
    cursor: ConversationListCursor | undefined,
): Record<string, unknown> {
    if (!cursor) {
        return {};
    }

    if (cursor.lastMessageAt === null) {
        return {
            lastMessageAt: null,
            conversationId: {
                $lt: cursor.conversationId,
            },
        };
    }

    return {
        $or: [
            {
                lastMessageAt: {
                    $lt: cursor.lastMessageAt,
                },
            },
            {
                lastMessageAt: cursor.lastMessageAt,
                conversationId: {
                    $lt: cursor.conversationId,
                },
            },
            {
                lastMessageAt: null,
            },
        ],
    };
}
