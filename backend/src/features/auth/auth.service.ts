import type { Logger } from "pino";

import { AppError } from "../../shared/errors/app-error.js";
import { verifyPassword } from "../../shared/security/password.js";
import type { OrganisationDocument } from "../organisations/organisation.types.js";
import type { UserDocument } from "../users/user.types.js";
import {
    findOrganisationForLogin,
    findUserForLogin,
    incrementFailedLoginCount,
    recordSuccessfulLogin,
} from "./auth.repository.js";
import type {
    LoginFailureReason,
    LoginInput,
    LoginOperationalReason,
    LoginResult,
} from "./auth.types.js";
import {
    createInitialRefreshTokenMaterial,
    persistInitialRefreshToken,
} from "./refresh-token.service.js";
import { createAccessToken } from "./token.service.js";

const DUMMY_PASSWORD_HASH =
    "$argon2id$v=19$m=19456,p=1,t=2$tctGzLy+e7DPgILRdtqpEQ$IN0OAhhfqdOcZ/4l+bvHt/+XDLBsOv5q/+pQ+EEJxak";

function createInvalidCredentialsError(): AppError {
    return new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
    );
}

interface AuthDependencies {
    createAccessToken: typeof createAccessToken;
    createInitialRefreshTokenMaterial:
        typeof createInitialRefreshTokenMaterial;
    findOrganisationForLogin:
        (slug: string) => Promise<OrganisationDocument | null>;
    findUserForLogin:
        (
            orgId: string,
            emailNormalized: string,
        ) => Promise<UserDocument | null>;
    incrementFailedLoginCount: typeof incrementFailedLoginCount;
    persistInitialRefreshToken: typeof persistInitialRefreshToken;
    recordSuccessfulLogin: typeof recordSuccessfulLogin;
    verifyPassword: typeof verifyPassword;
}

const defaultDependencies: AuthDependencies = {
    createAccessToken,
    createInitialRefreshTokenMaterial,
    findOrganisationForLogin,
    findUserForLogin,
    incrementFailedLoginCount,
    persistInitialRefreshToken,
    recordSuccessfulLogin,
    verifyPassword,
};

function logFailedLogin(
    log: Logger,
    reasonCode: LoginFailureReason,
    identifiers: {
        orgId?: string;
        userId?: string;
    } = {},
): void {
    log.warn(
        {
            event: "auth.login_failed",
            reasonCode,
            ...identifiers,
        },
        "Login failed",
    );
}

function logOperationalError(
    log: Logger,
    reasonCode: LoginOperationalReason,
    identifiers: {
        orgId?: string;
        userId?: string;
    } = {},
): void {
    log.error(
        {
            event: "auth.login_operational_error",
            reasonCode,
            ...identifiers,
        },
        "Login operation failed",
    );
}

export function createAuthService(
    dependencies: AuthDependencies = defaultDependencies,
) {
    async function performDummyVerification(
        candidatePassword: string,
        log: Logger,
    ): Promise<void> {
        try {
            await dependencies.verifyPassword(
                DUMMY_PASSWORD_HASH,
                candidatePassword,
            );
        } catch {
            logOperationalError(
                log,
                "DUMMY_PASSWORD_VERIFICATION_FAILED",
            );

            throw new AppError(
                503,
                "DEPENDENCY_UNAVAILABLE",
                "Login is temporarily unavailable.",
            );
        }
    }

    async function incrementFailureBestEffort(
        orgId: string,
        userId: string,
        log: Logger,
    ): Promise<void> {
        try {
            await dependencies.incrementFailedLoginCount(orgId, userId);
        } catch {
            logOperationalError(
                log,
                "LOGIN_METADATA_UPDATE_FAILED",
                {
                    orgId,
                    userId,
                },
            );
        }
    }

    async function recordSuccessBestEffort(
        orgId: string,
        userId: string,
        log: Logger,
    ): Promise<void> {
        try {
            await dependencies.recordSuccessfulLogin(
                orgId,
                userId,
                new Date(),
            );
        } catch {
            logOperationalError(
                log,
                "LOGIN_METADATA_UPDATE_FAILED",
                {
                    orgId,
                    userId,
                },
            );
        }
    }

    return {
        async login(
            input: LoginInput,
            log: Logger,
        ): Promise<LoginResult> {
            let organisation: OrganisationDocument | null;

            try {
                organisation =
                    await dependencies.findOrganisationForLogin(
                        input.organisationSlug,
                    );
            } catch {
                logOperationalError(log, "MONGODB_QUERY_FAILED");

                throw new AppError(
                    503,
                    "DEPENDENCY_UNAVAILABLE",
                    "Login is temporarily unavailable.",
                );
            }

            if (
                !organisation
                || organisation.status !== "ACTIVE"
            ) {
                await performDummyVerification(input.password, log);
                logFailedLogin(
                    log,
                    organisation
                        ? "ORGANISATION_SUSPENDED"
                        : "ORGANISATION_NOT_FOUND",
                    organisation
                        ? {
                            orgId: organisation.orgId,
                        }
                        : {},
                );

                throw createInvalidCredentialsError();
            }

            let user: UserDocument | null;

            try {
                user = await dependencies.findUserForLogin(
                    organisation.orgId,
                    input.emailNormalized,
                );
            } catch {
                logOperationalError(
                    log,
                    "MONGODB_QUERY_FAILED",
                    {
                        orgId: organisation.orgId,
                    },
                );

                throw new AppError(
                    503,
                    "DEPENDENCY_UNAVAILABLE",
                    "Login is temporarily unavailable.",
                );
            }

            if (!user?.passwordHash) {
                await performDummyVerification(input.password, log);
                logFailedLogin(
                    log,
                    "USER_NOT_FOUND",
                    {
                        orgId: organisation.orgId,
                    },
                );

                throw createInvalidCredentialsError();
            }

            let passwordMatches: boolean;

            try {
                passwordMatches = await dependencies.verifyPassword(
                    user.passwordHash,
                    input.password,
                );
            } catch {
                logOperationalError(
                    log,
                    "PASSWORD_HASH_INVALID",
                    {
                        orgId: organisation.orgId,
                        userId: user.userId,
                    },
                );

                await incrementFailureBestEffort(
                    organisation.orgId,
                    user.userId,
                    log,
                );
                await performDummyVerification(input.password, log);
                logFailedLogin(
                    log,
                    "PASSWORD_HASH_INVALID",
                    {
                        orgId: organisation.orgId,
                        userId: user.userId,
                    },
                );

                throw createInvalidCredentialsError();
            }

            if (
                !passwordMatches
                || user.status !== "ACTIVE"
            ) {
                await incrementFailureBestEffort(
                    organisation.orgId,
                    user.userId,
                    log,
                );
                logFailedLogin(
                    log,
                    user.status === "ACTIVE"
                        ? "PASSWORD_MISMATCH"
                        : "USER_INACTIVE",
                    {
                        orgId: organisation.orgId,
                        userId: user.userId,
                    },
                );

                throw createInvalidCredentialsError();
            }

            const refreshTokenMaterial =
                dependencies.createInitialRefreshTokenMaterial(
                    organisation.orgId,
                    user.userId,
                );

            try {
                await dependencies.persistInitialRefreshToken(
                    refreshTokenMaterial,
                );
            } catch {
                logOperationalError(
                    log,
                    "REFRESH_TOKEN_PERSISTENCE_FAILED",
                    {
                        orgId: organisation.orgId,
                        userId: user.userId,
                    },
                );

                throw new AppError(
                    503,
                    "DEPENDENCY_UNAVAILABLE",
                    "Login is temporarily unavailable.",
                );
            }

            let accessTokenResult: Awaited<
                ReturnType<typeof createAccessToken>
            >;

            try {
                accessTokenResult =
                    await dependencies.createAccessToken({
                        userId: user.userId,
                        orgId: organisation.orgId,
                        role: user.role,
                        permissions: user.permissions,
                        sessionId: refreshTokenMaterial.sessionId,
                    });
            } catch {
                logOperationalError(
                    log,
                    "TOKEN_SIGNING_FAILED",
                    {
                        orgId: organisation.orgId,
                        userId: user.userId,
                    },
                );

                throw new AppError(
                    500,
                    "INTERNAL_ERROR",
                    "An unexpected error occurred.",
                );
            }

            await recordSuccessBestEffort(
                organisation.orgId,
                user.userId,
                log,
            );

            log.info(
                {
                    event: "auth.login_succeeded",
                    orgId: organisation.orgId,
                    userId: user.userId,
                },
                "Login succeeded",
            );

            return {
                accessToken: accessTokenResult.accessToken,
                expiresInSeconds:
                    accessTokenResult.expiresInSeconds,
                refreshToken: refreshTokenMaterial.rawToken,
                user: {
                    userId: user.userId,
                    email: user.email,
                    displayName: user.displayName,
                    role: user.role,
                    permissions: user.permissions,
                    ...(user.teamId === undefined
                        ? {}
                        : {
                            teamId: user.teamId,
                        }),
                    organisation: {
                        orgId: organisation.orgId,
                        name: organisation.name,
                        plan: organisation.plan,
                    },
                },
            };
        },
    };
}

export const authService = createAuthService();
