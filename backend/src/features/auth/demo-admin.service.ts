import { randomUUID } from "node:crypto";

import type { Logger } from "pino";

import { AppError } from "../../shared/errors/app-error.js";
import {
    DEMO_ORGANISATION,
    DEMO_PRIVATE_ADMIN,
} from "../../shared/demo/demo-identities.js";
import { appendAudit } from "../audit/audit.service.js";
import { buildAuditMetadata } from "../audit/audit.metadata.js";
import { USER_PERMISSIONS_BY_ROLE } from "../users/user.types.js";
import { createSafeAuthProfile } from "./auth-profile.js";
import {
    findOrganisationForLogin,
    findUserByOrgIdAndEmailNormalized,
} from "./auth.repository.js";
import type { PublicAdminDemoResult } from "./auth.types.js";
import { createPublicAdminDemoAccessToken } from "./token.service.js";

interface DemoAdminDependencies {
    readonly appendAudit: typeof appendAudit;
    readonly createAccessToken: typeof createPublicAdminDemoAccessToken;
    readonly findOrganisation: typeof findOrganisationForLogin;
    readonly findUser: typeof findUserByOrgIdAndEmailNormalized;
    readonly randomUUID: typeof randomUUID;
}

const defaultDependencies: DemoAdminDependencies = {
    appendAudit,
    createAccessToken: createPublicAdminDemoAccessToken,
    findOrganisation: findOrganisationForLogin,
    findUser: findUserByOrgIdAndEmailNormalized,
    randomUUID,
};

function unavailableError(): AppError {
    return new AppError(
        503,
        "DEMO_ADMIN_UNAVAILABLE",
        "The public admin demo is temporarily unavailable.",
    );
}

export function createDemoAdminService(
    dependencies: DemoAdminDependencies = defaultDependencies,
) {
    return {
        async start(
            log: Logger,
            requestId: string,
        ): Promise<PublicAdminDemoResult> {
            let organisation;
            let user;

            try {
                organisation = await dependencies.findOrganisation(
                    DEMO_ORGANISATION.slug,
                );
                user = organisation === null
                    ? null
                    : await dependencies.findUser(
                        organisation.orgId,
                        DEMO_PRIVATE_ADMIN.email.toLowerCase(),
                    );
            } catch {
                throw unavailableError();
            }

            const canonicalPermissions =
                USER_PERMISSIONS_BY_ROLE.ORG_ADMIN;
            const permissionsAreCanonical = user !== null
                && user.permissions.length === canonicalPermissions.length
                && canonicalPermissions.every((permission) =>
                    user.permissions.includes(permission));

            if (
                organisation === null
                || organisation.status !== "ACTIVE"
                || user === null
                || user.status !== "ACTIVE"
                || user.role !== "ORG_ADMIN"
                || !permissionsAreCanonical
            ) {
                throw unavailableError();
            }

            const sessionId = dependencies.randomUUID();
            let token;

            try {
                token = await dependencies.createAccessToken({
                    userId: user.userId,
                    orgId: organisation.orgId,
                    role: user.role,
                    permissions: [...user.permissions],
                    sessionId,
                });
            } catch {
                throw unavailableError();
            }

            log.info(
                {
                    event: "auth.demo_admin_started",
                    orgId: organisation.orgId,
                    userId: user.userId,
                },
                "Public admin demo started",
            );

            try {
                await dependencies.appendAudit({
                    orgId: organisation.orgId,
                    actorId: user.userId,
                    actorType: "USER",
                    actorRole: user.role,
                    action: "auth.login_succeeded",
                    outcome: "SUCCESS",
                    requestId,
                    resourceType: "AUTH_SESSION",
                    resourceId: sessionId,
                    metadata: buildAuditMetadata(
                        "auth.login_succeeded",
                        {},
                    ),
                });
            } catch {
                log.error(
                    {
                        event: "auth.audit_write_failed",
                        errorCode: "AUDIT_UNAVAILABLE",
                        orgId: organisation.orgId,
                    },
                    "Authentication audit write failed",
                );
            }

            return {
                accessToken: token.accessToken,
                expiresAt: token.expiresAt,
                expiresInSeconds: token.expiresInSeconds,
                user: createSafeAuthProfile(user, organisation),
            };
        },
    };
}

export const demoAdminService = createDemoAdminService();
