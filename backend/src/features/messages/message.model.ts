import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import type { Model } from "mongoose";

import {
    MESSAGE_ROLES,
    type EncryptedMessageContent,
    type Message,
} from "./message.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { model, models, Schema } = mongoose;

const encryptedMessageContentSchema = new Schema<EncryptedMessageContent>(
    {
        algorithm: {
            type: String,
            enum: ["AES-256-GCM"],
            required: true,
        },
        ciphertext: {
            type: String,
            minlength: 1,
            required: true,
        },
        iv: {
            type: String,
            minlength: 1,
            required: true,
        },
        authTag: {
            type: String,
            minlength: 1,
            required: true,
        },
        keyVersion: {
            type: Number,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            required: true,
            validate: {
                validator: Number.isSafeInteger,
                message: "keyVersion must be a positive safe integer",
            },
        },
    },
    {
        _id: false,
        strict: "throw",
    },
);

const messageSchema = new Schema<Message>(
    {
        messageId: {
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
        conversationId: {
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
        requestId: {
            type: String,
            immutable: true,
            maxlength: 128,
        },
        role: {
            type: String,
            enum: MESSAGE_ROLES,
            required: true,
        },
        contentEnc: {
            type: encryptedMessageContentSchema,
            select: false,
        },
        contentStored: {
            type: Boolean,
            default: false,
            required: true,
        },
        tokenCount: {
            type: Number,
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
            validate: {
                validator: Number.isSafeInteger,
                message: "tokenCount must be a non-negative safe integer",
            },
        },
    },
    {
        collection: "messages",
        strict: "throw",
        timestamps: {
            createdAt: true,
            updatedAt: false,
        },
        toJSON: {
            transform: (_document, returnedObject) => {
                const {
                    contentEnc: _contentEnc,
                    ...safeObject
                } = returnedObject;

                return safeObject;
            },
        },
        toObject: {
            transform: (_document, returnedObject) => {
                const {
                    contentEnc: _contentEnc,
                    ...safeObject
                } = returnedObject;

                return safeObject;
            },
        },
    },
);

messageSchema.pre("validate", function validateContentStorageState() {
    if (!this.isNew) {
        return;
    }

    const hasEncryptedContent = this.contentEnc !== undefined;

    if (this.contentStored !== hasEncryptedContent) {
        this.invalidate(
            "contentStored",
            "contentStored must match encrypted content presence",
        );
    }
});

messageSchema.index(
    {
        messageId: 1,
    },
    {
        name: "uniq_messages_message_id",
        unique: true,
    },
);
messageSchema.index(
    {
        orgId: 1,
        requestId: 1,
        role: 1,
    },
    {
        name: "uniq_messages_org_request_role",
        unique: true,
        partialFilterExpression: {
            requestId: {
                $exists: true,
            },
        },
    },
);
messageSchema.index(
    {
        orgId: 1,
        conversationId: 1,
        createdAt: 1,
    },
    {
        name: "idx_messages_org_conversation_created",
    },
);

const existingMessageModel = models.Message as Model<Message> | undefined;

export const MessageModel =
    existingMessageModel
    ?? model<Message>("Message", messageSchema);
