import { OrganisationModel } from "../organisations/organisation.model.js";
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
