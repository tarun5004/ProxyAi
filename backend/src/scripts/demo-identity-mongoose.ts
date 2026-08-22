import mongoose from "mongoose";

import { RefreshTokenModel } from "../features/auth/refresh-token.model.js";
import { OrganisationModel } from "../features/organisations/organisation.model.js";
import { UserModel } from "../features/users/user.model.js";
import type { UserDocument } from "../features/users/user.types.js";
import {
    hashPassword,
    verifyPassword,
} from "../shared/security/password.js";
import type {
    DemoIdentityDependencies,
    DemoIdentityUpdate,
} from "./demo-identity-provisioning.js";

export function createMongooseDemoIdentityDependencies(): DemoIdentityDependencies {
    return {
        applyExistingIdentity: async (input) => {
            let sessionsRevoked = 0;

            await mongoose.connection.transaction(async (session) => {
                if (input.update !== undefined) {
                    const user = await UserModel.findOne({
                        orgId: input.orgId,
                        userId: input.userId,
                    })
                        .select("+failedLoginCount +lockedUntil +passwordHash")
                        .session(session)
                        .exec();

                    if (user === null) {
                        throw new Error("Demo identity disappeared during update.");
                    }

                    applyCanonicalIdentity(user, input.update);
                    await user.save({ session });
                }

                if (input.revokeSessions) {
                    const result = await RefreshTokenModel.updateMany(
                        {
                            orgId: input.orgId,
                            revokedAt: null,
                            userId: input.userId,
                        },
                        {
                            $set: {
                                revokedAt: new Date(),
                            },
                        },
                        {
                            runValidators: true,
                            session,
                        },
                    ).exec();
                    sessionsRevoked = result.modifiedCount;
                }
            });

            return sessionsRevoked;
        },
        createIdentity: async (input) => {
            await mongoose.connection.transaction(async (session) => {
                await UserModel.create(
                    [
                        {
                            ...input,
                            failedLoginCount: 0,
                            permissions: [...input.permissions],
                        },
                    ],
                    { session },
                );
            });
        },
        findIdentity: async (orgId, emailNormalized) => {
            const user = await UserModel.findOne({
                emailNormalized,
                orgId,
            })
                .select("+emailNormalized +failedLoginCount +lockedUntil +passwordHash")
                .exec();

            if (user === null) {
                return null;
            }

            return {
                displayName: user.displayName,
                email: user.email,
                failedLoginCount: user.failedLoginCount,
                ...(user.lockedUntil === undefined
                    ? {}
                    : { lockedUntil: user.lockedUntil }),
                passwordHash: user.passwordHash,
                permissions: user.permissions,
                role: user.role,
                status: user.status,
                ...(user.teamId === undefined ? {} : { teamId: user.teamId }),
                userId: user.userId,
            };
        },
        findOrganisation: async (slug) => {
            const organisation = await OrganisationModel.findOne({ slug }).exec();

            if (organisation === null) {
                return null;
            }

            return {
                orgId: organisation.orgId,
                retentionMode: organisation.retention.mode,
                status: organisation.status,
            };
        },
        hashPassword,
        verifyPassword,
    };
}

function applyCanonicalIdentity(
    user: UserDocument,
    update: DemoIdentityUpdate,
): void {
    user.displayName = update.displayName;
    user.email = update.email;
    user.failedLoginCount = 0;
    user.set("lockedUntil", undefined);
    user.permissions = [...update.permissions];
    user.role = update.role;
    user.status = update.status;
    user.set("teamId", undefined);

    if (update.passwordHash !== undefined) {
        user.passwordHash = update.passwordHash;
    }
}
