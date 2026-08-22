import type {
    UserPermission,
    UserRole,
    UserStatus,
} from "../features/users/user.types.js";

export interface DemoIdentityTarget {
    readonly displayName: string;
    readonly email: string;
    readonly organisationSlug: string;
    readonly permissions: readonly UserPermission[];
    readonly requiredRetentionMode?: "METADATA_ONLY";
    readonly role: UserRole;
}

export interface DemoOrganisationState {
    readonly orgId: string;
    readonly retentionMode: "METADATA_ONLY" | "ENCRYPTED_STORAGE";
    readonly status: "ACTIVE" | "SUSPENDED";
}

export interface DemoIdentityState {
    readonly displayName: string;
    readonly email: string;
    readonly failedLoginCount: number;
    readonly lockedUntil?: Date;
    readonly passwordHash: string;
    readonly permissions: readonly UserPermission[];
    readonly role: UserRole;
    readonly status: UserStatus;
    readonly teamId?: string;
    readonly userId: string;
}

export interface DemoIdentityWrite {
    readonly displayName: string;
    readonly email: string;
    readonly orgId: string;
    readonly passwordHash: string;
    readonly permissions: readonly UserPermission[];
    readonly role: UserRole;
    readonly status: "ACTIVE";
}

export interface DemoIdentityUpdate {
    readonly displayName: string;
    readonly email: string;
    readonly passwordHash?: string;
    readonly permissions: readonly UserPermission[];
    readonly role: UserRole;
    readonly status: "ACTIVE";
}

export interface DemoIdentityDependencies {
    readonly applyExistingIdentity: (input: {
        readonly orgId: string;
        readonly revokeSessions: boolean;
        readonly update?: DemoIdentityUpdate;
        readonly userId: string;
    }) => Promise<number>;
    readonly createIdentity: (input: DemoIdentityWrite) => Promise<void>;
    readonly findIdentity: (
        orgId: string,
        emailNormalized: string,
    ) => Promise<DemoIdentityState | null>;
    readonly findOrganisation: (
        slug: string,
    ) => Promise<DemoOrganisationState | null>;
    readonly hashPassword: (password: string) => Promise<string>;
    readonly verifyPassword: (
        storedHash: string,
        candidatePassword: string,
    ) => Promise<boolean>;
}

export interface DemoIdentityProvisioningInput {
    readonly apply: boolean;
    readonly password: string;
    readonly revokeSessionsOnEveryApply: boolean;
    readonly target: DemoIdentityTarget;
}

export interface DemoIdentityProvisioningResult {
    readonly action: "CREATE" | "NO_CHANGE" | "RESET_SESSIONS" | "UPDATE";
    readonly applied: boolean;
    readonly credentialsReset: boolean;
    readonly sessionsRevoked: number;
    readonly sessionsWillBeRevoked: boolean;
}

export class DemoIdentityProvisioningError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "DemoIdentityProvisioningError";
    }
}

export async function provisionDemoIdentity(
    input: DemoIdentityProvisioningInput,
    dependencies: DemoIdentityDependencies,
): Promise<DemoIdentityProvisioningResult> {
    const organisation = await dependencies.findOrganisation(
        input.target.organisationSlug,
    );

    if (organisation === null) {
        throw new DemoIdentityProvisioningError(
            "Target demo organisation was not found.",
        );
    }

    if (organisation.status !== "ACTIVE") {
        throw new DemoIdentityProvisioningError(
            "Target demo organisation must be ACTIVE.",
        );
    }

    if (
        input.target.requiredRetentionMode !== undefined
        && organisation.retentionMode !== input.target.requiredRetentionMode
    ) {
        throw new DemoIdentityProvisioningError(
            "Public demo reset requires METADATA_ONLY retention.",
        );
    }

    const existingIdentity = await dependencies.findIdentity(
        organisation.orgId,
        input.target.email.toLowerCase(),
    );

    if (existingIdentity === null) {
        if (input.apply) {
            await dependencies.createIdentity({
                displayName: input.target.displayName,
                email: input.target.email,
                orgId: organisation.orgId,
                passwordHash: await dependencies.hashPassword(input.password),
                permissions: input.target.permissions,
                role: input.target.role,
                status: "ACTIVE",
            });
        }

        return {
            action: "CREATE",
            applied: input.apply,
            credentialsReset: true,
            sessionsRevoked: 0,
            sessionsWillBeRevoked: false,
        };
    }

    const passwordMatches = await passwordMatchesSafely(
        existingIdentity.passwordHash,
        input.password,
        dependencies.verifyPassword,
    );
    const identityChanged = hasIdentityDrift(existingIdentity, input.target);
    const securityStateChanged = identityChanged
        || !passwordMatches
        || existingIdentity.failedLoginCount !== 0
        || existingIdentity.lockedUntil !== undefined;
    const sessionsWillBeRevoked = input.revokeSessionsOnEveryApply
        || securityStateChanged;

    if (!input.apply) {
        return {
            action: securityStateChanged ? "UPDATE" : (
                sessionsWillBeRevoked ? "RESET_SESSIONS" : "NO_CHANGE"
            ),
            applied: false,
            credentialsReset: !passwordMatches,
            sessionsRevoked: 0,
            sessionsWillBeRevoked,
        };
    }

    if (!securityStateChanged && !sessionsWillBeRevoked) {
        return {
            action: "NO_CHANGE",
            applied: true,
            credentialsReset: false,
            sessionsRevoked: 0,
            sessionsWillBeRevoked: false,
        };
    }

    let passwordHash: string | undefined;
    if (!passwordMatches) {
        passwordHash = await dependencies.hashPassword(input.password);
    }

    const sessionsRevoked = await dependencies.applyExistingIdentity({
        orgId: organisation.orgId,
        revokeSessions: sessionsWillBeRevoked,
        ...(securityStateChanged
            ? {
                update: {
                    displayName: input.target.displayName,
                    email: input.target.email,
                    ...(passwordHash === undefined ? {} : { passwordHash }),
                    permissions: input.target.permissions,
                    role: input.target.role,
                    status: "ACTIVE" as const,
                },
            }
            : {}),
        userId: existingIdentity.userId,
    });

    return {
        action: securityStateChanged
            ? "UPDATE"
            : (sessionsWillBeRevoked ? "RESET_SESSIONS" : "NO_CHANGE"),
        applied: true,
        credentialsReset: !passwordMatches,
        sessionsRevoked,
        sessionsWillBeRevoked,
    };
}

function hasIdentityDrift(
    current: DemoIdentityState,
    target: DemoIdentityTarget,
): boolean {
    return current.displayName !== target.displayName
        || current.email !== target.email
        || current.role !== target.role
        || current.status !== "ACTIVE"
        || current.teamId !== undefined
        || !hasExactPermissions(current.permissions, target.permissions);
}

function hasExactPermissions(
    current: readonly UserPermission[],
    target: readonly UserPermission[],
): boolean {
    return current.length === target.length
        && target.every((permission) => current.includes(permission));
}

async function passwordMatchesSafely(
    storedHash: string,
    candidatePassword: string,
    verifyPassword: DemoIdentityDependencies["verifyPassword"],
): Promise<boolean> {
    try {
        return await verifyPassword(storedHash, candidatePassword);
    } catch {
        return false;
    }
}
