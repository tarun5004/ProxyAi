import type { HydratedDocument } from "mongoose";

export const USER_ROLES = [
    "EMPLOYEE",
    "TEAM_LEAD",
    "ORG_ADMIN",
] as const;

export const USER_STATUSES = [
    "INVITED",
    "ACTIVE",
    "DISABLED",
] as const;

export const USER_PERMISSIONS = [
    "chat:send",
    "chat:view_own",
    "team:view_logs",
    "admin:view_logs",
    "admin:view_billing",
    "admin:manage_users",
    "admin:configure_policy",
    "admin:export_audit",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type UserPermission = (typeof USER_PERMISSIONS)[number];

export interface User {
    userId: string;
    orgId: string;
    email: string;
    emailNormalized: string;
    passwordHash: string;
    displayName: string;
    role: UserRole;
    permissions: UserPermission[];
    teamId?: string;
    status: UserStatus;
    failedLoginCount: number;
    lockedUntil?: Date;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;
