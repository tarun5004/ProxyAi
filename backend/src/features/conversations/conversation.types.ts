import type { HydratedDocument } from "mongoose";

export const DEFAULT_CONVERSATION_TITLE = "New conversation";

export interface Conversation {
    conversationId: string;
    orgId: string;
    userId: string;
    title: string;
    messageCount: number;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export type ConversationDocument = HydratedDocument<Conversation>;

export interface CreateConversationInput {
    readonly orgId: string;
    readonly userId: string;
    readonly title?: string;
}

export interface ConversationSummary {
    readonly conversationId: string;
    readonly title: string;
    readonly messageCount: number;
    readonly createdAt: Date;
    readonly lastMessageAt: Date | null;
}
