import type { OrganisationPlan } from "../organisations/organisation.types.js";
import type {
    UserPermission,
    UserRole,
} from "../users/user.types.js";

export interface LoginInput {
    organisationSlug: string;
    emailNormalized: string;
    password: string;
}

export interface AccessTokenInput {
    userId: string;
    orgId: string;
    role: UserRole;
    permissions: UserPermission[];
    sessionId: string;
}

export interface LoginResponseUser {
    userId: string;
    email: string;
    displayName: string;
    role: UserRole;
    permissions: UserPermission[];
    teamId?: string;
    organisation: {
        orgId: string;
        name: string;
        plan: OrganisationPlan;
    };
}

export interface LoginResult {
    accessToken: string;
    expiresInSeconds: number;
    refreshToken: string;
    user: LoginResponseUser;
}

export interface RefreshSessionResult {
    accessToken: string;
    expiresInSeconds: number;
    refreshToken: string;
}

export type LogoutOperationalReason =
    | "MONGODB_QUERY_FAILED"
    | "REFRESH_TOKEN_REVOCATION_FAILED";

export type LoginFailureReason =
    | "ORGANISATION_NOT_FOUND"
    | "ORGANISATION_SUSPENDED"
    | "USER_NOT_FOUND"
    | "USER_INACTIVE"
    | "PASSWORD_MISMATCH"
    | "PASSWORD_HASH_INVALID";

export type LoginOperationalReason =
    | "DUMMY_PASSWORD_VERIFICATION_FAILED"
    | "LOGIN_METADATA_UPDATE_FAILED"
    | "MONGODB_QUERY_FAILED"
    | "PASSWORD_HASH_INVALID"
    | "RATE_LIMIT_UNAVAILABLE"
    | "REFRESH_TOKEN_PERSISTENCE_FAILED"
    | "TOKEN_SIGNING_FAILED";

export type RefreshFailureReason =
    | "REFRESH_TOKEN_MISSING"
    | "REFRESH_TOKEN_UNKNOWN"
    | "REFRESH_TOKEN_EXPIRED"
    | "REFRESH_TOKEN_REVOKED"
    | "REFRESH_TOKEN_USED"
    | "USER_INACTIVE"
    | "ORGANISATION_INACTIVE";

export type RefreshOperationalReason =
    | "MONGODB_QUERY_FAILED"
    | "REFRESH_TOKEN_CLAIM_FAILED"
    | "REFRESH_TOKEN_PERSISTENCE_FAILED"
    | "TOKEN_SIGNING_FAILED";
