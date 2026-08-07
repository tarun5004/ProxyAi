import type { Logger } from "pino";

import { AppError } from "../../shared/errors/app-error.js";
import { verifyPassword } from "../../shared/security/password.js";
import type { OrganisationDocument } from "../organisations/organisation.types.js";
import type { UserDocument } from "../users/user.types.js";
import {
    claimRefreshTokenForRotation,
    findOrganisationByOrgId,
    findOrganisationForLogin,
    findRefreshTokenByHash,
    findUserByOrgIdAndUserId,
    findUserForLogin,
    incrementFailedLoginCount,
    persistReplacementRefreshToken,
    recordSuccessfulLogin,
    revokeRefreshTokenFamily,
} from "./auth.repository.js";
import type {
    LoginFailureReason,
    LoginInput,
    LoginOperationalReason,
    LoginResult,
    LogoutOperationalReason,
    RefreshFailureReason,
    RefreshOperationalReason,
    RefreshSessionResult,
} from "./auth.types.js";
import {
    createInitialRefreshTokenMaterial,
    createRotatedRefreshTokenMaterial,
    hashRefreshToken,
    persistInitialRefreshToken,
} from "./refresh-token.service.js";
import { createAccessToken } from "./token.service.js";
import type { RefreshTokenDocument } from "./refresh-token.types.js";

const DUMMY_PASSWORD_HASH =
    "$argon2id$v=19$m=19456,p=1,t=2$tctGzLy+e7DPgILRdtqpEQ$IN0OAhhfqdOcZ/4l+bvHt/+XDLBsOv5q/+pQ+EEJxak";

function createInvalidCredentialsError(): AppError {
    return new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
    );
}

function createInvalidRefreshTokenError(): AppError {
    return new AppError(
        401,
        "INVALID_REFRESH_TOKEN",
        "Session is invalid or expired.",
    );
}

function createAuthUnavailableError(): AppError {
    return new AppError(
        503,
        "AUTH_TEMPORARILY_UNAVAILABLE",
        "Authentication is temporarily unavailable.",
    );
}

interface AuthDependencies {
    claimRefreshTokenForRotation: typeof claimRefreshTokenForRotation;
    createAccessToken: typeof createAccessToken;
    createInitialRefreshTokenMaterial:
        typeof createInitialRefreshTokenMaterial;
    createRotatedRefreshTokenMaterial:
        typeof createRotatedRefreshTokenMaterial;
    findOrganisationByOrgId: typeof findOrganisationByOrgId;
    findOrganisationForLogin:
        (slug: string) => Promise<OrganisationDocument | null>;
    findRefreshTokenByHash:
        (tokenHash: string) => Promise<RefreshTokenDocument | null>;
    findUserByOrgIdAndUserId: typeof findUserByOrgIdAndUserId;
    findUserForLogin:
        (
            orgId: string,
            emailNormalized: string,
        ) => Promise<UserDocument | null>;
    hashRefreshToken: typeof hashRefreshToken;
    incrementFailedLoginCount: typeof incrementFailedLoginCount;
    persistInitialRefreshToken: typeof persistInitialRefreshToken;
    persistReplacementRefreshToken:
        typeof persistReplacementRefreshToken;
    recordSuccessfulLogin: typeof recordSuccessfulLogin;
    revokeRefreshTokenFamily: typeof revokeRefreshTokenFamily;
    verifyPassword: typeof verifyPassword;
}

const defaultDependencies: AuthDependencies = {
    claimRefreshTokenForRotation,
    createAccessToken,
    createInitialRefreshTokenMaterial,
    createRotatedRefreshTokenMaterial,
    findOrganisationByOrgId,
    findOrganisationForLogin,
    findRefreshTokenByHash,
    findUserByOrgIdAndUserId,
    findUserForLogin,
    hashRefreshToken,
    incrementFailedLoginCount,
    persistInitialRefreshToken,
    persistReplacementRefreshToken,
    recordSuccessfulLogin,
    revokeRefreshTokenFamily,
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

function logRefreshFailed(
    log: Logger,
    reasonCode: RefreshFailureReason,
    identifiers: {
        orgId?: string;
        userId?: string;
    } = {},
): void {
    log.warn(
        {
            event: "auth.refresh_failed",
            reasonCode,
            ...identifiers,
        },
        "Refresh failed",
    );
}

function logRefreshOperationalError(
    log: Logger,
    reasonCode: RefreshOperationalReason,
    identifiers: {
        orgId?: string;
        userId?: string;
    } = {},
): void {
    log.error(
        {
            event: "auth.refresh_operational_error",
            reasonCode,
            ...identifiers,
        },
        "Refresh operation failed",
    );
}

function logLogoutSuccess(
    log: Logger,
    reasonCode: "REFRESH_TOKEN_MISSING" | "REFRESH_TOKEN_UNKNOWN" | "REFRESH_TOKEN_REVOKED",
): void {
    log.info(
        {
            event: "auth.logout_succeeded",
            reasonCode,
        },
        "Logout succeeded",
    );
}

function logLogoutOperationalError(
    log: Logger,
    reasonCode: LogoutOperationalReason,
): void {
    log.error(
        {
            event: "auth.logout_operational_error",
            reasonCode,
        },
        "Logout operation failed",
    );
}

function logRefreshReuseDetected(
    log: Logger,
    identifiers: {
        orgId: string;
        userId: string;
    },
): void {
    log.warn(
        {
            event: "auth.refresh_reuse_detected",
            ...identifiers,
        },
        "Refresh token reuse detected",
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

        async refreshSession(
            rawRefreshToken: string,
            log: Logger,
        ): Promise<RefreshSessionResult> {
            const tokenHash =
                dependencies.hashRefreshToken(rawRefreshToken);
            let existingToken: RefreshTokenDocument | null;

            try {
                existingToken =
                    await dependencies.findRefreshTokenByHash(
                        tokenHash,
                    );
            } catch {
                logRefreshOperationalError(
                    log,
                    "MONGODB_QUERY_FAILED",
                );

                throw createAuthUnavailableError();
            }

            if (!existingToken) {
                logRefreshFailed(log, "REFRESH_TOKEN_UNKNOWN");

                throw createInvalidRefreshTokenError();
            }

            const identifiers = {
                orgId: existingToken.orgId,
                userId: existingToken.userId,
            };
            const now = new Date();

            if (existingToken.usedAt) {
                await revokeFamilyBestEffort(existingToken, log);
                logRefreshReuseDetected(log, identifiers);

                throw createInvalidRefreshTokenError();
            }

            if (existingToken.revokedAt) {
                logRefreshFailed(
                    log,
                    "REFRESH_TOKEN_REVOKED",
                    identifiers,
                );

                throw createInvalidRefreshTokenError();
            }

            if (existingToken.expiresAt <= now) {
                logRefreshFailed(
                    log,
                    "REFRESH_TOKEN_EXPIRED",
                    identifiers,
                );

                throw createInvalidRefreshTokenError();
            }

            const replacementMaterial =
                dependencies.createRotatedRefreshTokenMaterial(
                    {
                        familyId: existingToken.familyId,
                        orgId: existingToken.orgId,
                        sessionId: existingToken.sessionId,
                        userId: existingToken.userId,
                    },
                    now,
                );

            let claimedToken: RefreshTokenDocument | null;

            try {
                claimedToken =
                    await dependencies.claimRefreshTokenForRotation(
                        existingToken._id,
                        existingToken.orgId,
                        replacementMaterial.tokenId,
                        now,
                    );
            } catch {
                logRefreshOperationalError(
                    log,
                    "REFRESH_TOKEN_CLAIM_FAILED",
                    identifiers,
                );

                throw createAuthUnavailableError();
            }

            if (!claimedToken) {
                await revokeFamilyBestEffort(existingToken, log);
                logRefreshReuseDetected(log, identifiers);

                throw createInvalidRefreshTokenError();
            }

            let organisation: OrganisationDocument | null;
            let user: UserDocument | null;

            try {
                [organisation, user] = await Promise.all([
                    dependencies.findOrganisationByOrgId(
                        existingToken.orgId,
                    ),
                    dependencies.findUserByOrgIdAndUserId(
                        existingToken.orgId,
                        existingToken.userId,
                    ),
                ]);
            } catch {
                await revokeFamilyBestEffort(existingToken, log);
                logRefreshOperationalError(
                    log,
                    "MONGODB_QUERY_FAILED",
                    identifiers,
                );

                throw createAuthUnavailableError();
            }

            if (!organisation || organisation.status !== "ACTIVE") {
                await revokeFamilyBestEffort(existingToken, log);
                logRefreshFailed(
                    log,
                    "ORGANISATION_INACTIVE",
                    identifiers,
                );

                throw createInvalidRefreshTokenError();
            }

            if (!user || user.status !== "ACTIVE") {
                await revokeFamilyBestEffort(existingToken, log);
                logRefreshFailed(log, "USER_INACTIVE", identifiers);

                throw createInvalidRefreshTokenError();
            }

            try {
                await dependencies.persistReplacementRefreshToken({
                    expiresAt: replacementMaterial.expiresAt,
                    familyId: replacementMaterial.familyId,
                    orgId: replacementMaterial.orgId,
                    sessionId: replacementMaterial.sessionId,
                    tokenHash: replacementMaterial.tokenHash,
                    tokenId: replacementMaterial.tokenId,
                    userId: replacementMaterial.userId,
                });
            } catch {
                await revokeFamilyBestEffort(existingToken, log);
                logRefreshOperationalError(
                    log,
                    "REFRESH_TOKEN_PERSISTENCE_FAILED",
                    identifiers,
                );

                throw createAuthUnavailableError();
            }

            let accessTokenResult: Awaited<
                ReturnType<typeof createAccessToken>
            >;

            try {
                accessTokenResult =
                    await dependencies.createAccessToken({
                        userId: user.userId,
                        orgId: existingToken.orgId,
                        role: user.role,
                        permissions: user.permissions,
                        sessionId: existingToken.sessionId,
                    });
            } catch {
                await revokeFamilyBestEffort(existingToken, log);
                logRefreshOperationalError(
                    log,
                    "TOKEN_SIGNING_FAILED",
                    identifiers,
                );

                throw createAuthUnavailableError();
            }

            log.info(
                {
                    event: "auth.refresh_succeeded",
                    ...identifiers,
                },
                "Refresh succeeded",
            );

            return {
                accessToken: accessTokenResult.accessToken,
                expiresInSeconds:
                    accessTokenResult.expiresInSeconds,
                refreshToken: replacementMaterial.rawToken,
            };
        },

        async logoutSession(
            rawRefreshToken: string | undefined,
            log: Logger,
        ): Promise<void> {
            if (!rawRefreshToken) {
                logLogoutSuccess(log, "REFRESH_TOKEN_MISSING");

                return;
            }

            const tokenHash = dependencies.hashRefreshToken(
                rawRefreshToken,
            );
            let existingToken: RefreshTokenDocument | null;

            try {
                existingToken = await dependencies.findRefreshTokenByHash(
                    tokenHash,
                );
            } catch {
                logLogoutOperationalError(
                    log,
                    "MONGODB_QUERY_FAILED",
                );

                throw createAuthUnavailableError();
            }

            if (!existingToken) {
                logLogoutSuccess(log, "REFRESH_TOKEN_UNKNOWN");

                return;
            }

            try {
                await dependencies.revokeRefreshTokenFamily(
                    {
                        familyId: existingToken.familyId,
                        orgId: existingToken.orgId,
                        sessionId: existingToken.sessionId,
                        userId: existingToken.userId,
                    },
                    new Date(),
                );
            } catch {
                logLogoutOperationalError(
                    log,
                    "REFRESH_TOKEN_REVOCATION_FAILED",
                );

                throw createAuthUnavailableError();
            }

            logLogoutSuccess(
                log,
                "REFRESH_TOKEN_REVOKED",
            );
        },
    };

    async function revokeFamilyBestEffort(
        token: RefreshTokenDocument,
        log: Logger,
    ): Promise<void> {
        try {
            await dependencies.revokeRefreshTokenFamily(
                {
                    familyId: token.familyId,
                    orgId: token.orgId,
                    sessionId: token.sessionId,
                    userId: token.userId,
                },
                new Date(),
            );
        } catch {
            logRefreshOperationalError(
                log,
                "REFRESH_TOKEN_PERSISTENCE_FAILED",
                {
                    orgId: token.orgId,
                    userId: token.userId,
                },
            );
        }
    }
}

export const authService = createAuthService();
