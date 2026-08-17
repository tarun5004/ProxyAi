import { OrganisationModel } from "../organisations/organisation.model.js";
import { BillingRollupModel } from "./billing-rollup.model.js";
import type {
    BillingRollupDocument,
    NewRequestUsageRecord,
    PeriodUsageAggregate,
    RequestUsageDocument,
} from "./billing.types.js";
import { RequestLogModel } from "./request-log.model.js";

interface OrganisationBudgetRecord {
    readonly monthlyTokenBudget: number;
}

interface UsageAggregationRow {
    readonly usedTokens: number;
    readonly sourceRequestCount: number;
    readonly knownUsageCount: number;
}

export interface BillingRepository {
    appendUsage(
        input: NewRequestUsageRecord,
    ): Promise<RequestUsageDocument>;
    findOrganisationBudget(
        orgId: string,
    ): Promise<OrganisationBudgetRecord | null>;
    aggregatePeriodUsage(
        orgId: string,
        periodStart: Date,
        periodEnd: Date,
    ): Promise<PeriodUsageAggregate>;
    upsertRollup(input: {
        orgId: string;
        period: string;
        usedTokens: number;
        sourceRequestCount: number;
    }): Promise<BillingRollupDocument>;
}

export const billingRepository: BillingRepository = {
    async appendUsage(input) {
        return RequestLogModel.create({
            requestId: input.requestId,
            orgId: input.orgId,
            userId: input.userId,
            providerId: input.providerId,
            model: input.model,
            ...(input.usage === undefined
                ? {}
                : {
                    inputTokens: input.usage.inputTokens,
                    outputTokens: input.usage.outputTokens,
                    totalTokens: input.usage.totalTokens,
                }),
        });
    },
    async findOrganisationBudget(orgId) {
        return OrganisationModel.findOne({
            orgId,
        })
            .select({
                _id: 0,
                monthlyTokenBudget: 1,
            })
            .lean<OrganisationBudgetRecord>()
            .exec();
    },
    async aggregatePeriodUsage(orgId, periodStart, periodEnd) {
        const rows = await RequestLogModel.aggregate<UsageAggregationRow>([
            {
                $match: {
                    orgId,
                    createdAt: {
                        $gte: periodStart,
                        $lt: periodEnd,
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    usedTokens: {
                        $sum: {
                            $ifNull: ["$totalTokens", 0],
                        },
                    },
                    sourceRequestCount: {
                        $sum: 1,
                    },
                    knownUsageCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $isNumber: "$inputTokens" },
                                        { $isNumber: "$outputTokens" },
                                        { $isNumber: "$totalTokens" },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]).exec();
        const row = rows[0];

        return row === undefined
            ? {
                usedTokens: 0,
                sourceRequestCount: 0,
                knownUsageCount: 0,
            }
            : {
                usedTokens: row.usedTokens,
                sourceRequestCount: row.sourceRequestCount,
                knownUsageCount: row.knownUsageCount,
            };
    },
    async upsertRollup(input) {
        return BillingRollupModel.findOneAndUpdate(
            {
                orgId: input.orgId,
                period: input.period,
            },
            {
                $set: {
                    usedTokens: input.usedTokens,
                    sourceRequestCount: input.sourceRequestCount,
                },
            },
            {
                returnDocument: "after",
                runValidators: true,
                setDefaultsOnInsert: true,
                upsert: true,
            },
        ).orFail();
    },
};
