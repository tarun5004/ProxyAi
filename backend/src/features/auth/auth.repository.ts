import { OrganisationModel } from "../organisations/organisation.model.js";
import type { RefreshTokenDocument } from "./refresh-token.types.js";
import { RefreshTokenModel } from "./refresh-token.model.js";
import { UserModel } from "../users/user.model.js";

export async function findOrganisationForLogin(slug: string) {
    return OrganisationModel.findOne({
        slug,
    }).exec();
}

export async function findUserForLogin(
    orgId: string,
    emailNormalized: string,
) {
    return UserModel.findOne({
        orgId,
        emailNormalized,
    })
        .select("+passwordHash +failedLoginCount")
        .exec();
}

export async function incrementFailedLoginCount(
    orgId: string,
    userId: string,
): Promise<void> {
    await UserModel.updateOne(
        {
            orgId,
            userId,
        },
        {
            $inc: {
                failedLoginCount: 1,
            },
        },
        {
            runValidators: true,
        },
    ).exec();
}

export async function recordSuccessfulLogin(
    orgId: string,
    userId: string,
    lastLoginAt: Date,
): Promise<void> {
    await UserModel.updateOne(
        {
            orgId,
            userId,
        },
        {
            $set: {
                failedLoginCount: 0,
                lastLoginAt,
            },
        },
        {
            runValidators: true,
        },
    ).exec();
}

export async function findRefreshTokenByHash(tokenHash: string) {
    return RefreshTokenModel.findOne({
        tokenHash,
    }).exec();
}

export async function claimRefreshTokenForRotation(
    tokenDocumentId: RefreshTokenDocument["_id"],
    orgId: string,
    replacedByTokenId: string,
    usedAt: Date,
) {
    return RefreshTokenModel.findOneAndUpdate(
        {
            _id: tokenDocumentId,
            expiresAt: {
                $gt: usedAt,
            },
            orgId,
            revokedAt: null,
            usedAt: null,
        },
        {
            $set: {
                replacedByTokenId,
                usedAt,
            },
        },
        {
            returnDocument: "before",
            runValidators: true,
        },
    ).exec();
}

export async function persistReplacementRefreshToken(input: {
    expiresAt: Date;
    familyId: string;
    orgId: string;
    sessionId: string;
    tokenHash: string;
    tokenId: string;
    userId: string;
}): Promise<void> {
    await RefreshTokenModel.create({
        expiresAt: input.expiresAt,
        familyId: input.familyId,
        orgId: input.orgId,
        sessionId: input.sessionId,
        tokenHash: input.tokenHash,
        tokenId: input.tokenId,
        userId: input.userId,
    });
}

export async function revokeRefreshTokenFamily(
    input: {
        familyId: string;
        orgId: string;
        sessionId: string;
        userId: string;
    },
    revokedAt: Date,
): Promise<void> {
    await RefreshTokenModel.updateMany(
        {
            familyId: input.familyId,
            orgId: input.orgId,
            revokedAt: null,
            sessionId: input.sessionId,
            userId: input.userId,
        },
        {
            $set: {
                revokedAt,
            },
        },
        {
            runValidators: true,
        },
    ).exec();
}

export async function findOrganisationByOrgId(orgId: string) {
    return OrganisationModel.findOne({
        orgId,
    }).exec();
}

export async function findUserByOrgIdAndUserId(
    orgId: string,
    userId: string,
) {
    return UserModel.findOne({
        orgId,
        userId,
    }).exec();
}
