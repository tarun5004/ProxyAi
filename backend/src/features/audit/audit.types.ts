import type { ClientSession, HydratedDocument } from "mongoose";

import type { UserRole } from "../users/user.types.js";

export const AUDIT_ACTOR_TYPES = ["USER", "SYSTEM"] as const;
export const AUDIT_OUTCOMES = ["SUCCESS", "FAILURE"] as const;
export const AUDIT_ACTIONS = [
    "auth.login_succeeded",
    "auth.login_failed",
    "auth.login_operational_error",
    "auth.logout_succeeded",
    "auth.refresh_reuse_detected",
    "policy.allow",
    "policy.mask",
    "policy.block",
    "user.role_changed",
    "user.team_changed",
    "user.status_changed",
    "user.sessions_revoked",
    "organisation.policy_changed",
    "organisation.budget_changed",
    "organisation.retention_changed",
    "alert.resolved",
    "alert.reopened",
    "audit.exported",
] as const;
export const AUDIT_RESOURCE_TYPES = [
    "AUTH_SESSION",
    "POLICY_DECISION",
    "USER",
    "ORGANISATION",
    "ALERT",
    "AUDIT_EXPORT",
] as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];
export type SafeAuditMetadata = Readonly<Record<
    string,
    string | number | boolean | null
>>;

export interface AuditLog {
    auditId: string;
    orgId: string;
    actorId?: string;
    actorType: AuditActorType;
    actorRole?: UserRole;
    action: AuditAction;
    outcome: AuditOutcome;
    resourceType: AuditResourceType;
    resourceId?: string;
    metadata: SafeAuditMetadata;
    ipAddress?: string;
    userAgent?: string;
    requestId: string;
    occurredAt: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;

export interface NewAuditLog extends Omit<AuditLog, "auditId" | "occurredAt"> {
    readonly auditId?: string;
    readonly occurredAt?: Date;
}

export interface AuditExportFilter {
    readonly orgId: string;
    readonly dateFrom: Date;
    readonly dateTo: Date;
    readonly actorId?: string;
    readonly action?: string;
    readonly limit: number;
}

export interface AuditListCursor {
    readonly occurredAt: Date;
    readonly auditId: string;
}

export interface AuditBrowseFilter {
    readonly orgId: string;
    readonly dateFrom: Date;
    readonly dateTo: Date;
    readonly limit: number;
    readonly cursor?: AuditListCursor;
    readonly actorId?: string;
    readonly action?: AuditAction;
}

export interface SafeAuditLogItem {
    readonly auditId: string;
    readonly actorId?: string;
    readonly actorType: AuditActorType;
    readonly actorRole?: UserRole;
    readonly action: AuditAction;
    readonly outcome: AuditOutcome;
    readonly resourceType: AuditResourceType;
    readonly resourceId?: string;
    readonly metadata: SafeAuditMetadata;
    readonly requestId: string;
    readonly occurredAt: Date;
}

export interface AuditBrowseResult {
    readonly items: readonly SafeAuditLogItem[];
    readonly hasMore: boolean;
}

export interface AuditAppendOptions {
    readonly session?: ClientSession;
}
