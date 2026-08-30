import type { ClientSession } from "mongoose";

import { AppError } from "../../shared/errors/app-error.js";
import { isEncryptionReady } from "../../shared/security/encryption.js";
import { AlertModel } from "../alerts/alert.model.js";
import { appendAudit, withAuditedTransaction } from "../audit/audit.service.js";
import { buildAuditMetadata } from "../audit/audit.metadata.js";
import type { NewAuditLog } from "../audit/audit.types.js";
import { RefreshTokenModel } from "../auth/refresh-token.model.js";
import { OrganisationModel } from "../organisations/organisation.model.js";
import { DEFAULT_MAX_OUTPUT_TOKENS_PER_REQUEST } from "../organisations/organisation.types.js";
import type { RetentionMode } from "../organisations/organisation.types.js";
import { TeamModel } from "../teams/team.model.js";
import { UserModel } from "../users/user.model.js";
import {
    USER_PERMISSIONS_BY_ROLE,
    type UserRole,
} from "../users/user.types.js";

export interface AdminMutationContext {
    readonly orgId: string;
    readonly actorId: string;
    readonly actorRole: UserRole;
    readonly requestId: string;
    readonly ipAddress?: string;
    readonly userAgent?: string;
}

export async function changeUserRole(
    context: AdminMutationContext,
    userId: string,
    role: UserRole,
) {
    return withAuditedTransaction(async (session) => {
        await lockOrganisation(context.orgId, session);
        const user = await requireUser(context.orgId, userId, session);

        if (role === "TEAM_LEAD" && user.status === "ACTIVE" && !user.teamId) {
            throw conflict("TEAM_ASSIGNMENT_REQUIRED", "A team assignment is required.");
        }

        if (user.role === "ORG_ADMIN" && user.status === "ACTIVE" && role !== "ORG_ADMIN") {
            await assertAnotherActiveAdmin(context.orgId, userId, session);
        }

        const oldRole = user.role;
        user.role = role;
        user.permissions = [...USER_PERMISSIONS_BY_ROLE[role]];
        await user.save({ session });
        await appendAdminAudit(context, {
            action: "user.role_changed",
            resourceType: "USER",
            resourceId: userId,
            metadata: buildAuditMetadata("user.role_changed", { oldRole, newRole: role }),
        }, session);

        return safeUser(user);
    });
}

export async function changeUserTeam(
    context: AdminMutationContext,
    userId: string,
    teamId: string | null,
) {
    return withAuditedTransaction(async (session) => {
        await lockOrganisation(context.orgId, session);
        const user = await requireUser(context.orgId, userId, session);

        if (teamId !== null) {
            const team = await TeamModel.findOne({ orgId: context.orgId, teamId })
                .session(session)
                .exec();
            if (team === null) throw notFound();
        }

        if (teamId === null && user.role === "TEAM_LEAD" && user.status === "ACTIVE") {
            throw conflict("TEAM_ASSIGNMENT_REQUIRED", "A team assignment is required.");
        }

        const oldTeamId = user.teamId ?? null;
        if (teamId === null) {
            user.set("teamId", undefined);
        } else {
            user.teamId = teamId;
        }
        await user.save({ session });
        await appendAdminAudit(context, {
            action: "user.team_changed",
            resourceType: "USER",
            resourceId: userId,
            metadata: buildAuditMetadata("user.team_changed", { oldTeamId, newTeamId: teamId }),
        }, session);

        return safeUser(user);
    });
}

export async function changeUserStatus(
    context: AdminMutationContext,
    userId: string,
    status: "ACTIVE" | "DISABLED",
) {
    return withAuditedTransaction(async (session) => {
        await lockOrganisation(context.orgId, session);
        const user = await requireUser(context.orgId, userId, session);

        if (user.role === "ORG_ADMIN" && user.status === "ACTIVE" && status === "DISABLED") {
            await assertAnotherActiveAdmin(context.orgId, userId, session);
        }
        if (status === "ACTIVE" && user.role === "TEAM_LEAD" && !user.teamId) {
            throw conflict("TEAM_ASSIGNMENT_REQUIRED", "A team assignment is required.");
        }

        const oldStatus = user.status;
        user.status = status;
        await user.save({ session });
        const revokedSessionCount = status === "DISABLED"
            ? await revokeSessions(context.orgId, userId, session)
            : 0;
        await appendAdminAudit(context, {
            action: "user.status_changed",
            resourceType: "USER",
            resourceId: userId,
            metadata: buildAuditMetadata("user.status_changed", {
                oldStatus,
                newStatus: status,
                revokedSessionCount,
            }),
        }, session);

        return safeUser(user);
    });
}

export async function revokeUserSessions(
    context: AdminMutationContext,
    userId: string,
) {
    return withAuditedTransaction(async (session) => {
        await lockOrganisation(context.orgId, session);
        await requireUser(context.orgId, userId, session);
        const effectiveAt = new Date();
        const revokedSessionCount = await revokeSessions(
            context.orgId,
            userId,
            session,
            effectiveAt,
        );
        await appendAdminAudit(context, {
            action: "user.sessions_revoked",
            resourceType: "USER",
            resourceId: userId,
            metadata: buildAuditMetadata("user.sessions_revoked", { revokedSessionCount }),
        }, session);

        return { userId, revokedSessionCount, effectiveAt };
    });
}

export async function updateOrganisationPolicy(
    context: AdminMutationContext,
    patch: {
        readonly maskThreshold?: number;
        readonly blockThreshold?: number;
        readonly maxOutputTokensPerRequest?: number;
        readonly monthlyTokenBudget?: number;
    },
) {
    return withAuditedTransaction(async (session) => {
        const organisation = await OrganisationModel.findOne({ orgId: context.orgId })
            .session(session)
            .exec();
        if (organisation === null) throw notFound();

        const oldMaskThreshold = organisation.policy.maskThreshold;
        const oldBlockThreshold = organisation.policy.blockThreshold;
        const oldMaxOutputTokensPerRequest = organisation.policy.maxOutputTokensPerRequest
            ?? DEFAULT_MAX_OUTPUT_TOKENS_PER_REQUEST;
        const oldMonthlyTokenBudget = organisation.monthlyTokenBudget;
        organisation.policy.maskThreshold = patch.maskThreshold ?? oldMaskThreshold;
        organisation.policy.blockThreshold = patch.blockThreshold ?? oldBlockThreshold;
        organisation.policy.maxOutputTokensPerRequest =
            patch.maxOutputTokensPerRequest ?? oldMaxOutputTokensPerRequest;
        organisation.monthlyTokenBudget = patch.monthlyTokenBudget ?? oldMonthlyTokenBudget;
        await organisation.validate();
        await organisation.save({ session });

        if (
            oldMaskThreshold !== organisation.policy.maskThreshold
            || oldBlockThreshold !== organisation.policy.blockThreshold
            || oldMaxOutputTokensPerRequest
                !== organisation.policy.maxOutputTokensPerRequest
        ) {
            await appendAdminAudit(context, {
                action: "organisation.policy_changed",
                resourceType: "ORGANISATION",
                resourceId: context.orgId,
                metadata: buildAuditMetadata("organisation.policy_changed", {
                    oldMaskThreshold,
                    newMaskThreshold: organisation.policy.maskThreshold,
                    oldBlockThreshold,
                    newBlockThreshold: organisation.policy.blockThreshold,
                    oldMaxOutputTokensPerRequest,
                    newMaxOutputTokensPerRequest:
                        organisation.policy.maxOutputTokensPerRequest,
                }),
            }, session);
        }
        if (oldMonthlyTokenBudget !== organisation.monthlyTokenBudget) {
            await appendAdminAudit(context, {
                action: "organisation.budget_changed",
                resourceType: "ORGANISATION",
                resourceId: context.orgId,
                metadata: buildAuditMetadata("organisation.budget_changed", {
                    oldMonthlyTokenBudget,
                    newMonthlyTokenBudget: organisation.monthlyTokenBudget,
                }),
            }, session);
        }

        return {
            policy: {
                maskThreshold: organisation.policy.maskThreshold,
                blockThreshold: organisation.policy.blockThreshold,
                maxOutputTokensPerRequest:
                    organisation.policy.maxOutputTokensPerRequest,
            },
            monthlyTokenBudget: organisation.monthlyTokenBudget,
            updatedAt: organisation.updatedAt,
        };
    });
}

export async function updateOrganisationRetention(
    context: AdminMutationContext,
    mode: RetentionMode,
) {
    if (mode === "ENCRYPTED_STORAGE" && !isEncryptionReady()) {
        throw new AppError(503, "ENCRYPTION_UNAVAILABLE", "Encrypted storage is temporarily unavailable.");
    }

    return withAuditedTransaction(async (session) => {
        const organisation = await OrganisationModel.findOne({ orgId: context.orgId })
            .session(session)
            .exec();
        if (organisation === null) throw notFound();
        const oldMode = organisation.retention.mode;
        organisation.retention.mode = mode;
        await organisation.save({ session });
        await appendAdminAudit(context, {
            action: "organisation.retention_changed",
            resourceType: "ORGANISATION",
            resourceId: context.orgId,
            metadata: buildAuditMetadata("organisation.retention_changed", { oldMode, newMode: mode }),
        }, session);

        return { retention: { mode }, effectiveAt: new Date() };
    });
}

export async function updateAlertResolution(
    context: AdminMutationContext,
    alertId: string,
    resolved: boolean,
) {
    return withAuditedTransaction(async (session) => {
        const existingAlert = await AlertModel.findOne({
            orgId: context.orgId,
            alertId,
        }).session(session).lean().exec();
        if (existingAlert === null) throw notFound();
        const oldStatus = existingAlert.status;
        const newStatus = resolved ? "RESOLVED" : "OPEN";
        const resolvedAt = resolved ? new Date() : undefined;
        const alert = await AlertModel.findOneAndUpdate(
            { orgId: context.orgId, alertId },
            {
                $set: {
                    status: newStatus,
                    ...(resolvedAt === undefined ? {} : { resolvedAt }),
                },
                ...(resolvedAt === undefined ? { $unset: { resolvedAt: 1 } } : {}),
            },
            { returnDocument: "after", runValidators: true, session },
        ).exec();
        if (alert === null) throw notFound();
        const action = resolved ? "alert.resolved" : "alert.reopened";
        await appendAdminAudit(context, {
            action,
            resourceType: "ALERT",
            resourceId: alertId,
            metadata: buildAuditMetadata(action, { oldStatus, newStatus }),
        }, session);

        return {
            alertId,
            resolved,
            ...(resolvedAt === undefined ? {} : { resolvedAt }),
        };
    });
}

async function appendAdminAudit(
    context: AdminMutationContext,
    input: Pick<NewAuditLog, "action" | "resourceType" | "resourceId" | "metadata">,
    session: ClientSession,
) {
    await appendAudit({
        orgId: context.orgId,
        actorId: context.actorId,
        actorType: "USER",
        actorRole: context.actorRole,
        outcome: "SUCCESS",
        requestId: context.requestId,
        ...input,
        ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
        ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent }),
    }, session);
}

async function lockOrganisation(orgId: string, session: ClientSession) {
    const result = await OrganisationModel.updateOne(
        { orgId },
        { $set: { updatedAt: new Date() } },
        { session },
    ).exec();
    if (result.matchedCount !== 1) throw notFound();
}

async function requireUser(orgId: string, userId: string, session: ClientSession) {
    const user = await UserModel.findOne({ orgId, userId }).session(session).exec();
    if (user === null) throw notFound();
    return user;
}

async function assertAnotherActiveAdmin(orgId: string, userId: string, session: ClientSession) {
    const count = await UserModel.countDocuments({
        orgId,
        userId: { $ne: userId },
        role: "ORG_ADMIN",
        status: "ACTIVE",
    }).session(session).exec();
    if (count === 0) throw conflict("LAST_ACTIVE_ORG_ADMIN", "The last active organisation admin cannot be changed.");
}

async function revokeSessions(
    orgId: string,
    userId: string,
    session: ClientSession,
    revokedAt = new Date(),
) {
    const result = await RefreshTokenModel.updateMany(
        { orgId, userId, revokedAt: null },
        { $set: { revokedAt } },
        { session, runValidators: true },
    ).exec();
    return result.modifiedCount;
}

function safeUser(user: Awaited<ReturnType<typeof requireUser>>) {
    return {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        permissions: user.permissions,
        ...(user.teamId === undefined ? {} : { teamId: user.teamId }),
        status: user.status,
        ...(user.lastLoginAt === undefined ? {} : { lastLoginAt: user.lastLoginAt }),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

function notFound() {
    return new AppError(404, "NOT_FOUND", "Resource not found.");
}

function conflict(code: string, message: string) {
    return new AppError(409, code, message);
}
