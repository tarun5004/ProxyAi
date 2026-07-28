import mongoose from "mongoose";
import type { Model } from "mongoose";

import type { RefreshToken } from "./refresh-token.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const { model, models, Schema } = mongoose;

const refreshTokenSchema = new Schema<RefreshToken>(
    {
        tokenId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        sessionId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        familyId: {
            type: String,
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
        tokenHash: {
            type: String,
            immutable: true,
            match: SHA_256_HEX_PATTERN,
            required: true,
            select: false,
        },
        expiresAt: {
            type: Date,
            immutable: true,
            required: true,
        },
        usedAt: {
            type: Date,
        },
        revokedAt: {
            type: Date,
        },
        replacedByTokenId: {
            type: String,
            match: UUID_V4_PATTERN,
        },
    },
    {
        collection: "refresh_tokens",
        strict: "throw",
        timestamps: true,
        toJSON: {
            transform: (_document, returnedObject) => {
                const {
                    tokenHash: _tokenHash,
                    ...safeObject
                } = returnedObject;

                return safeObject;
            },
        },
        toObject: {
            transform: (_document, returnedObject) => {
                const {
                    tokenHash: _tokenHash,
                    ...safeObject
                } = returnedObject;

                return safeObject;
            },
        },
    },
);

refreshTokenSchema.index(
    {
        tokenId: 1,
    },
    {
        name: "uniq_refresh_tokens_token_id",
        unique: true,
    },
);
refreshTokenSchema.index(
    {
        tokenHash: 1,
    },
    {
        name: "uniq_refresh_tokens_token_hash",
        unique: true,
    },
);
refreshTokenSchema.index(
    {
        orgId: 1,
        sessionId: 1,
    },
    {
        name: "idx_refresh_tokens_org_session",
    },
);
refreshTokenSchema.index(
    {
        orgId: 1,
        familyId: 1,
    },
    {
        name: "idx_refresh_tokens_org_family",
    },
);
refreshTokenSchema.index(
    {
        expiresAt: 1,
    },
    {
        expireAfterSeconds: 0,
        name: "ttl_refresh_tokens_expires_at",
    },
);

const existingRefreshTokenModel = models.RefreshToken as
    | Model<RefreshToken>
    | undefined;

export const RefreshTokenModel =
    existingRefreshTokenModel
    ?? model<RefreshToken>("RefreshToken", refreshTokenSchema);
