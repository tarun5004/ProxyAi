import type { HydratedDocument } from "mongoose";

export const MESSAGE_ROLES = [
    "USER",
    "ASSISTANT",
    "SYSTEM",
] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

export interface EncryptedMessageContent {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
}

export interface Message {
    messageId: string;
    orgId: string;
    conversationId: string;
    userId: string;
    role: MessageRole;
    contentEnc?: EncryptedMessageContent;
    contentStored: boolean;
    tokenCount?: number;
    createdAt: Date;
}

export type MessageDocument = HydratedDocument<Message>;

export type ApiMessageRole = "user" | "assistant" | "system";

export interface MessageListCursor {
    readonly createdAt: Date;
    readonly messageId: string;
}

export interface SafeMessageSummary {
    readonly messageId: string;
    readonly role: ApiMessageRole;
    readonly tokenCount?: number;
    readonly createdAt: Date;
    readonly contentAvailable: false;
}

export interface MessagePage {
    readonly items: readonly SafeMessageSummary[];
    readonly nextCursor: string | null;
}
