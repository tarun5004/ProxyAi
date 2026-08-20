import { AppError } from "../../shared/errors/app-error.js";
import { readAuthoritativeBudgetStatus } from "../billing/billing.service.js";
import { readProviderHealth } from "../providers/provider-health.store.js";
import { getEnabledProductionProviderIds } from "../providers/provider-runtime.registry.js";
import {
    adminRepository,
    type AdminRepository,
} from "./admin.repository.js";
import { encodeAdminCursor } from "./admin.cursor.js";
import type {
    AdminAlertItem,
    AdminPage,
    AdminPeriod,
    AdminRequestLogItem,
    AdminTeamItem,
    AdminUserItem,
} from "./admin.types.js";

export async function getAdminSummary(
    orgId: string,
    period: AdminPeriod,
    now: Date = new Date(),
    repository: AdminRepository = adminRepository,
) {
    const range = createPeriodRange(period, now);
    const [organisation, analytics, openAlerts, budget, providerHealth] = await Promise.all([
        repository.findOrganisation(orgId),
        repository.aggregateAnalytics({ orgId, ...range }),
        repository.countOpenAlerts(orgId),
        readAuthoritativeBudgetStatus(orgId, now),
        Promise.all(getEnabledProductionProviderIds().map(async (providerId) => ({
            providerId,
            ...await readProviderHealth(providerId),
        }))),
    ]);

    if (organisation === null) {
        throw new AppError(404, "NOT_FOUND", "Organisation not found.");
    }

    return {
        period,
        range: { from: range.start, to: range.end },
        organisation: {
            name: organisation.name,
            plan: organisation.plan,
            retentionMode: organisation.retention.mode,
            policy: organisation.policy,
        },
        requests: {
            total: analytics.totalRequests,
            completed: analytics.successfulRequests,
            blocked: analytics.blockedRequests,
            masked: analytics.maskedRequests,
            failed: analytics.failedRequests,
            interrupted: analytics.interruptedRequests,
        },
        usage: {
            knownRequestCount: analytics.knownUsageRequestCount,
            unknownRequestCount: analytics.unknownUsageRequestCount,
            inputTokens: analytics.inputTokens,
            outputTokens: analytics.outputTokens,
            totalTokens: analytics.totalTokens,
        },
        providerModels: analytics.providerModelRequestCounts,
        budget,
        alerts: { open: openAlerts },
        providerHealth,
    };
}

export async function getAdminBilling(
    orgId: string,
    period: string,
    repository: AdminRepository = adminRepository,
) {
    const range = createBillingPeriodRange(period);
    const [organisation, usage, analytics] = await Promise.all([
        repository.findOrganisation(orgId),
        repository.aggregateBilling({ orgId, ...range }),
        repository.aggregateAnalytics({ orgId, ...range }),
    ]);

    if (organisation === null) {
        throw new AppError(404, "NOT_FOUND", "Organisation not found.");
    }

    return {
        period,
        budget: {
            tokenLimit: organisation.monthlyTokenBudget,
            knownTokensUsed: usage.usedTokens,
            remainingKnownTokens: Math.max(
                organisation.monthlyTokenBudget - usage.usedTokens,
                0,
            ),
            exceededByKnownUsage: usage.usedTokens >= organisation.monthlyTokenBudget,
            accountingComplete: usage.knownUsageCount === usage.sourceRequestCount,
        },
        totals: {
            requestCount: usage.sourceRequestCount,
            knownUsageRequestCount: usage.knownUsageCount,
            unknownUsageRequestCount:
                usage.sourceRequestCount - usage.knownUsageCount,
            inputTokens: analytics.inputTokens,
            outputTokens: analytics.outputTokens,
            totalTokens: usage.usedTokens,
        },
        providerModels: analytics.providerModelRequestCounts,
        unresolvedUsage: usage.unresolvedUsageGroups,
    };
}

export async function listAdminLogs(
    input: Parameters<AdminRepository["listLogs"]>[0],
    repository: AdminRepository = adminRepository,
): Promise<AdminPage<AdminRequestLogItem>> {
    return toPage(await repository.listLogs(input), "requestId");
}

export async function listAdminAlerts(
    input: Parameters<AdminRepository["listAlerts"]>[0],
    repository: AdminRepository = adminRepository,
): Promise<AdminPage<AdminAlertItem>> {
    return toPage(await repository.listAlerts(input), "alertId");
}

export async function listAdminUsers(
    input: Parameters<AdminRepository["listUsers"]>[0],
    repository: AdminRepository = adminRepository,
): Promise<AdminPage<AdminUserItem>> {
    return toPage(await repository.listUsers(input), "userId");
}

export async function listAdminTeams(
    input: Parameters<AdminRepository["listTeams"]>[0],
    repository: AdminRepository = adminRepository,
): Promise<AdminPage<AdminTeamItem>> {
    return toPage(await repository.listTeams(input), "teamId");
}

function toPage<T extends { readonly createdAt: Date }>(
    result: { readonly items: readonly T[]; readonly hasMore: boolean },
    idField: keyof T,
): AdminPage<T> {
    const last = result.items.at(-1);

    return {
        items: result.items,
        nextCursor: result.hasMore && last !== undefined
            ? encodeAdminCursor({
                createdAt: last.createdAt,
                id: String(last[idField]),
            })
            : null,
    };
}

export function createPeriodRange(period: AdminPeriod, now: Date) {
    const end = new Date(now);
    let start: Date;

    if (period === "today") {
        start = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
        ));
    } else if (period === "month") {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    } else {
        const days = period === "7d" ? 7 : 30;
        start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    }

    return { start, end };
}

export function createBillingPeriodRange(period: string) {
    const [yearValue, monthValue] = period.split("-");
    const year = Number(yearValue);
    const month = Number(monthValue) - 1;

    return {
        start: new Date(Date.UTC(year, month, 1)),
        end: new Date(Date.UTC(year, month + 1, 1)),
    };
}

export function currentBillingPeriod(now = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
