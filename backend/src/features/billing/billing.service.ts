import { AppError } from "../../shared/errors/app-error.js";
import type { BudgetStatus } from "../policy/policy.types.js";
import { getProviderModelCapability } from "../providers/provider-capability.registry.js";
import {
    billingRepository,
    type BillingRepository,
} from "./billing.repository.js";
import type {
    BillingJobOutcome,
    NewRequestUsageRecord,
    PeriodUsageAggregate,
    RequestUsageDocument,
} from "./billing.types.js";

export async function appendRequestUsage(
    input: NewRequestUsageRecord,
    repository: BillingRepository = billingRepository,
): Promise<RequestUsageDocument> {
    try {
        return await repository.appendUsage(input);
    } catch {
        throw accountingUnavailable(
            "Request outcome could not be recorded.",
        );
    }
}

export async function readAuthoritativeBudgetStatus(
    orgId: string,
    now: Date = new Date(),
    repository: BillingRepository = billingRepository,
): Promise<Readonly<BudgetStatus>> {
    const period = getUtcBillingPeriod(now);
    const { start, end } = getUtcBillingPeriodBounds(now);

    try {
        const organisation = await repository.findOrganisationBudget(orgId);

        if (organisation === null) {
            throw accountingUnavailable(
                "Organisation budget configuration is unavailable.",
            );
        }

        const aggregate = await repository.aggregatePeriodUsage(
            orgId,
            start,
            end,
        );

        const reservedTokens = calculateUnresolvedUsageReservation(
            aggregate.unresolvedUsageGroups,
        );

        if (reservedTokens === 0) {
            await repository.upsertRollup({
                orgId,
                period,
                usedTokens: aggregate.usedTokens,
                sourceRequestCount: aggregate.sourceRequestCount,
            });
        }

        return createBudgetStatus(
            organisation.monthlyTokenBudget,
            aggregate.usedTokens,
            reservedTokens,
        );
    } catch (error: unknown) {
        if (
            error instanceof AppError
            && error.code === "BUDGET_ACCOUNTING_UNAVAILABLE"
        ) {
            throw error;
        }

        throw accountingUnavailable(
            "Token budget accounting is unavailable.",
        );
    }
}

export function getUtcBillingPeriod(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
}

export async function reconcileAuthoritativeTokenRollup(
    orgId: string,
    occurredAt: Date,
    repository: BillingRepository = billingRepository,
): Promise<BillingJobOutcome> {
    const period = getUtcBillingPeriod(occurredAt);
    const { start, end } = getUtcBillingPeriodBounds(occurredAt);
    const aggregate = await repository.aggregatePeriodUsage(
        orgId,
        start,
        end,
    );

    if (aggregate.knownUsageCount !== aggregate.sourceRequestCount) {
        return "USAGE_UNAVAILABLE";
    }

    await repository.upsertRollup({
        orgId,
        period,
        usedTokens: aggregate.usedTokens,
        sourceRequestCount: aggregate.sourceRequestCount,
    });

    return "APPLIED";
}

function getUtcBillingPeriodBounds(date: Date): {
    readonly start: Date;
    readonly end: Date;
} {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();

    return {
        start: new Date(Date.UTC(year, month, 1)),
        end: new Date(Date.UTC(year, month + 1, 1)),
    };
}

function createBudgetStatus(
    monthlyBudgetTokens: number,
    usedTokens: number,
    reservedTokens = 0,
): Readonly<BudgetStatus> {
    const budgetedTokens = usedTokens + reservedTokens;

    if (!Number.isSafeInteger(budgetedTokens)) {
        throw accountingUnavailable(
            "Token budget accounting is unavailable.",
        );
    }

    const remainingTokens = Math.max(
        monthlyBudgetTokens - budgetedTokens,
        0,
    );
    const remainingPercent = monthlyBudgetTokens === 0
        ? 0
        : (remainingTokens / monthlyBudgetTokens) * 100;

    return Object.freeze({
        monthlyBudgetTokens,
        usedTokens,
        ...(reservedTokens === 0
            ? {}
            : { reservedTokens, budgetedTokens }),
        remainingTokens,
        remainingPercent,
        exceeded: budgetedTokens >= monthlyBudgetTokens,
    });
}

function calculateUnresolvedUsageReservation(
    groups: PeriodUsageAggregate["unresolvedUsageGroups"],
): number {
    return groups.reduce((total, group) => {
        const capability = getProviderModelCapability(
            group.providerId,
            group.model,
        );
        const perRequestReservation =
            capability.maxInputTokens + capability.maxOutputTokens;
        const nextTotal = total
            + perRequestReservation * group.requestCount;

        if (!Number.isSafeInteger(nextTotal)) {
            throw accountingUnavailable(
                "Token budget accounting is unavailable.",
            );
        }

        return nextTotal;
    }, 0);
}

function accountingUnavailable(message: string): AppError {
    return new AppError(
        503,
        "BUDGET_ACCOUNTING_UNAVAILABLE",
        message,
    );
}
