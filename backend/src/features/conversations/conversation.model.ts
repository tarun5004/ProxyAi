import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import type { Model } from "mongoose";

import type { Conversation } from "./conversation.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { model, models, Schema } = mongoose;

const conversationSchema = new Schema<Conversation>(
    {
        conversationId: {
            type: String,
            default: () => randomUUID(),
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        orgId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        userId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        title: {
            type: String,
            default: "New conversation",
            trim: true,
            minlength: 1,
            maxlength: 120,
            required: true,
        },
        messageCount: {
            type: Number,
            default: 0,
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
            required: true,
            validate: {
                validator: Number.isSafeInteger,
                message: "messageCount must be a safe integer",
            },
        },
        lastMessageAt: {
            type: Date,
            default: null,
        },
    },
    {
        collection: "conversations",
        strict: "throw",
        timestamps: true,
    },
);

conversationSchema.index(
    {
        conversationId: 1,
    },
    {
        name: "uniq_conversations_conversation_id",
        unique: true,
    },
);
conversationSchema.index(
    {
        orgId: 1,
        userId: 1,
        lastMessageAt: -1,
    },
    {
        name: "idx_conversations_org_user_last_message",
    },
);

const existingConversationModel = models.Conversation as
    | Model<Conversation>
    | undefined;

export const ConversationModel =
    existingConversationModel
    ?? model<Conversation>("Conversation", conversationSchema);
