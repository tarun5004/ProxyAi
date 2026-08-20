import { ConversationModel } from "./conversation.model.js";
import type { EncryptedPayload } from "../../shared/security/encryption.js";
import type {
    ConversationDocument,
    ConversationListCursor,
} from "./conversation.types.js";

export interface NewConversationRecord {
    readonly conversationId: string;
    readonly orgId: string;
    readonly userId: string;
    readonly title: string;
    readonly titleEnc?: EncryptedPayload;
}

export interface ConversationRepository {
    create(input: NewConversationRecord): Promise<ConversationDocument>;
    findOwnedById(
        orgId: string,
        userId: string,
        conversationId: string,
    ): Promise<ConversationDocument | null>;
    updateTitleOwned(
        orgId: string,
        userId: string,
        conversationId: string,
        title: string,
        titleEnc?: EncryptedPayload,
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
        }).select("+titleEnc").exec();
    },
    async updateTitleOwned(orgId, userId, conversationId, title, titleEnc) {
        return ConversationModel.findOneAndUpdate(
            {
                orgId,
                userId,
                conversationId,
            },
            {
                $set: {
                    title,
                    ...(titleEnc === undefined ? {} : { titleEnc }),
                },
                ...(titleEnc === undefined ? { $unset: { titleEnc: 1 } } : {}),
            },
            {
                returnDocument: "after",
                runValidators: true,
            },
        ).select("+titleEnc").exec();
    },
    async listOwned(input) {
        return ConversationModel.find({
            orgId: input.orgId,
            userId: input.userId,
            ...createCursorFilter(input.cursor),
        }).select("+titleEnc")
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
