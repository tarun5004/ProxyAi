import { ConversationModel } from "./conversation.model.js";
import type { ConversationDocument } from "./conversation.types.js";

export interface NewConversationRecord {
    readonly orgId: string;
    readonly userId: string;
    readonly title: string;
}

export interface ConversationRepository {
    create(input: NewConversationRecord): Promise<ConversationDocument>;
}

export const conversationRepository: ConversationRepository = {
    async create(input) {
        return ConversationModel.create(input);
    },
};
