import { AlertModel } from "../alerts/alert.model.js";
import type { AnomalyAlertStatus } from "../alerts/alert.types.js";
import { analyticsRepository } from "../analytics/analytics.repository.js";
import type { AnalyticsAggregateValues } from "../analytics/analytics.types.js";
import { billingRepository } from "../billing/billing.repository.js";
import type { PeriodUsageAggregate } from "../billing/billing.types.js";
import { RequestLogModel } from "../billing/request-log.model.js";
import { OrganisationModel } from "../organisations/organisation.model.js";
import type { ProviderId } from "../providers/provider.types.js";
import { TeamModel } from "../teams/team.model.js";
import { UserModel } from "../users/user.model.js";
import type { UserRole, UserStatus } from "../users/user.types.js";
import type {
    AdminAlertItem,
    AdminListCursor,
    AdminRequestLogItem,
    AdminTeamItem,
    AdminUserItem,
} from "./admin.types.js";

interface OrganisationAdminRecord {
    readonly name: string;
    readonly plan: "FREE" | "PRO" | "ENTERPRISE";
    readonly monthlyTokenBudget: number;
    readonly retention: { readonly mode: "METADATA_ONLY" | "ENCRYPTED_STORAGE" };
    readonly policy: {
        readonly maskThreshold: number;
        readonly blockThreshold: number;
        readonly maxOutputTokensPerRequest?: number;
    };
}

interface AdminListResult<T> {
    readonly items: readonly T[];
    readonly hasMore: boolean;
}

interface MemberCountRow {
    readonly _id: string;
    readonly memberCount: number;
}

export interface AdminRepository {
    findOrganisation(orgId: string): Promise<OrganisationAdminRecord | null>;
    aggregateAnalytics(input: {
        orgId: string;
        start: Date;
        end: Date;
    }): Promise<AnalyticsAggregateValues>;
    aggregateBilling(input: {
        orgId: string;
        start: Date;
        end: Date;
    }): Promise<PeriodUsageAggregate>;
    countOpenAlerts(orgId: string): Promise<number>;
    listLogs(input: {
        orgId: string;
        limit: number;
        cursor?: AdminListCursor;
        userId?: string;
        providerId?: ProviderId;
        status?: AdminRequestLogItem["status"];
        policyAction?: AdminRequestLogItem["policyAction"];
        dateFrom?: Date;
        dateTo?: Date;
    }): Promise<AdminListResult<AdminRequestLogItem>>;
    listAlerts(input: {
        orgId: string;
        limit: number;
        cursor?: AdminListCursor;
        status?: AnomalyAlertStatus;
        userId?: string;
    }): Promise<AdminListResult<AdminAlertItem>>;
    listUsers(input: {
        orgId: string;
        limit: number;
        cursor?: AdminListCursor;
        role?: UserRole;
        status?: UserStatus;
        teamId?: string;
    }): Promise<AdminListResult<AdminUserItem>>;
    listTeams(input: {
        orgId: string;
        limit: number;
        cursor?: AdminListCursor;
        isActive?: boolean;
    }): Promise<AdminListResult<AdminTeamItem>>;
}

export const adminRepository: AdminRepository = {
    async findOrganisation(orgId) {
        return OrganisationModel.findOne({ orgId })
            .select({
                _id: 0,
                name: 1,
                plan: 1,
                monthlyTokenBudget: 1,
                retention: 1,
                policy: 1,
            })
            .lean<OrganisationAdminRecord>()
            .exec();
    },
    async aggregateAnalytics(input) {
        return analyticsRepository.aggregateDaily(input);
    },
    async aggregateBilling(input) {
        return billingRepository.aggregatePeriodUsage(
            input.orgId,
            input.start,
            input.end,
        );
    },
    async countOpenAlerts(orgId) {
        return AlertModel.countDocuments({ orgId, status: "OPEN" }).exec();
    },
    async listLogs(input) {
        const documents = await RequestLogModel.find({
            orgId: input.orgId,
            ...(input.userId === undefined ? {} : { userId: input.userId }),
            ...(input.providerId === undefined ? {} : { providerId: input.providerId }),
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.policyAction === undefined ? {} : { policyAction: input.policyAction }),
            ...createDateFilter(input.dateFrom, input.dateTo),
            ...createCursorFilter(input.cursor, "requestId"),
        })
            .select({ _id: 0, __v: 0, orgId: 0 })
            .sort({ createdAt: -1, requestId: -1 })
            .limit(input.limit + 1)
            .lean<AdminRequestLogItem[]>()
            .exec();

        return pageResult(documents, input.limit);
    },
    async listAlerts(input) {
        const documents = await AlertModel.find({
            orgId: input.orgId,
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.userId === undefined ? {} : { userId: input.userId }),
            ...createCursorFilter(input.cursor, "alertId"),
        })
            .select({ _id: 0, __v: 0, orgId: 0 })
            .sort({ createdAt: -1, alertId: -1 })
            .limit(input.limit + 1)
            .lean<AdminAlertItem[]>()
            .exec();

        return pageResult(documents, input.limit);
    },
    async listUsers(input) {
        const documents = await UserModel.find({
            orgId: input.orgId,
            ...(input.role === undefined ? {} : { role: input.role }),
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.teamId === undefined ? {} : { teamId: input.teamId }),
            ...createCursorFilter(input.cursor, "userId"),
        })
            .select({
                _id: 0,
                __v: 0,
                orgId: 0,
                emailNormalized: 0,
                passwordHash: 0,
                failedLoginCount: 0,
                lockedUntil: 0,
            })
            .sort({ createdAt: -1, userId: -1 })
            .limit(input.limit + 1)
            .lean<AdminUserItem[]>()
            .exec();

        return pageResult(documents, input.limit);
    },
    async listTeams(input) {
        const documents = await TeamModel.find({
            orgId: input.orgId,
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
            ...createCursorFilter(input.cursor, "teamId"),
        })
            .select({ _id: 0, __v: 0, orgId: 0, nameNormalized: 0 })
            .sort({ createdAt: -1, teamId: -1 })
            .limit(input.limit + 1)
            .lean<Omit<AdminTeamItem, "memberCount">[]>()
            .exec();
        const visibleDocuments = documents.slice(0, input.limit);
        const teamIds = visibleDocuments.map((team) => team.teamId);
        const memberCounts = teamIds.length === 0
            ? []
            : await UserModel.aggregate<MemberCountRow>([
                { $match: { orgId: input.orgId, teamId: { $in: teamIds } } },
                { $group: { _id: "$teamId", memberCount: { $sum: 1 } } },
            ]).exec();
        const countByTeamId = new Map(
            memberCounts.map((row) => [row._id, row.memberCount]),
        );

        return {
            items: visibleDocuments.map((team) => ({
                ...team,
                memberCount: countByTeamId.get(team.teamId) ?? 0,
            })),
            hasMore: documents.length > input.limit,
        };
    },
};

function createDateFilter(dateFrom?: Date, dateTo?: Date) {
    if (dateFrom === undefined && dateTo === undefined) {
        return {};
    }

    return {
        createdAt: {
            ...(dateFrom === undefined ? {} : { $gte: dateFrom }),
            ...(dateTo === undefined ? {} : { $lte: dateTo }),
        },
    };
}

function createCursorFilter(cursor: AdminListCursor | undefined, idField: string) {
    if (cursor === undefined) {
        return {};
    }

    return {
        $or: [
            { createdAt: { $lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, [idField]: { $lt: cursor.id } },
        ],
    };
}

function pageResult<T>(documents: readonly T[], limit: number): AdminListResult<T> {
    return {
        items: documents.slice(0, limit),
        hasMore: documents.length > limit,
    };
}
