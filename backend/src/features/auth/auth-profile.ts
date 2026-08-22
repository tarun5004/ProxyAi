import type { OrganisationDocument } from "../organisations/organisation.types.js";
import type { UserDocument } from "../users/user.types.js";
import type { LoginResponseUser } from "./auth.types.js";

export function createSafeAuthProfile(
    user: UserDocument,
    organisation: OrganisationDocument,
): LoginResponseUser {
    return {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        permissions: [...user.permissions],
        ...(user.teamId === undefined
            ? {}
            : {
                teamId: user.teamId,
            }),
        organisation: {
            orgId: organisation.orgId,
            name: organisation.name,
            plan: organisation.plan,
            retentionMode: organisation.retention.mode,
        },
    };
}
