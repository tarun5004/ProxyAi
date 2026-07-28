import type { HydratedDocument } from "mongoose";

export interface RefreshToken {
    tokenId: string;
    sessionId: string;
    familyId: string;
    orgId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
    revokedAt?: Date;
    replacedByTokenId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;
