import type { HydratedDocument } from "mongoose";

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
