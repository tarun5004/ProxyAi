import { OrganisationModel } from "../organisations/organisation.model.js";
import { BillingJobLedgerModel } from "./billing-job-ledger.model.js";
import { BillingRollupModel } from "./billing-rollup.model.js";
import type {
    AuthoritativeRequestUsage,
    BillingJobLedgerState,
    BillingJobOutcome,
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
    readonly _id: {
        readonly model: string;
        readonly providerId: NonNullable<
            NewRequestUsageRecord["providerId"]
        >;
        readonly usageKnown: boolean;
    };
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
    findRequestUsage(
        orgId: string,
        requestId: string,
    ): Promise<AuthoritativeRequestUsage | null>;
    acquireJobProcessing(input: {
        orgId: string;
        requestId: string;
        jobType: "request.completed";
        processingStartedAt: Date;
    }): Promise<"ACQUIRED" | BillingJobLedgerState>;
    completeJobProcessing(input: {
        orgId: string;
        requestId: string;
        jobType: "request.completed";
        completedAt: Date;
        outcome: BillingJobOutcome;
    }): Promise<void>;
    releaseJobProcessing(input: {
        orgId: string;
        requestId: string;
        jobType: "request.completed";
    }): Promise<void>;
}

export const billingRepository: BillingRepository = {
    async appendUsage(input) {
        return RequestLogModel.create({
            requestId: input.requestId,
            orgId: input.orgId,
            userId: input.userId,
            status: input.status,
            policyAction: input.policyAction,
            ...(input.providerId === undefined
                ? {}
                : { providerId: input.providerId }),
            ...(input.model === undefined ? {} : { model: input.model }),
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
                    status: {
                        $ne: "BLOCKED",
                    },
                    createdAt: {
                        $gte: periodStart,
                        $lt: periodEnd,
                    },
                },
            },
            {
                $group: {
                    _id: {
                        model: "$model",
                        providerId: "$providerId",
                        usageKnown: {
                            $and: [
                                { $isNumber: "$inputTokens" },
                                { $isNumber: "$outputTokens" },
                                { $isNumber: "$totalTokens" },
                            ],
                        },
                    },
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
        return rows.reduce<PeriodUsageAggregate>(
            (aggregate, row) => ({
                usedTokens: aggregate.usedTokens + row.usedTokens,
                sourceRequestCount:
                    aggregate.sourceRequestCount + row.sourceRequestCount,
                knownUsageCount:
                    aggregate.knownUsageCount + row.knownUsageCount,
                unresolvedUsageGroups: row._id.usageKnown
                    ? aggregate.unresolvedUsageGroups
                    : [
                        ...aggregate.unresolvedUsageGroups,
                        {
                            providerId: row._id.providerId,
                            model: row._id.model,
                            requestCount: row.sourceRequestCount,
                        },
                    ],
            }),
            {
                usedTokens: 0,
                sourceRequestCount: 0,
                knownUsageCount: 0,
                unresolvedUsageGroups: [],
            },
        );
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
    async findRequestUsage(orgId, requestId) {
        return RequestLogModel.findOne({
            orgId,
            requestId,
        })
            .select({
                _id: 0,
                createdAt: 1,
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 1,
            })
            .lean<AuthoritativeRequestUsage>()
            .exec();
    },
    async acquireJobProcessing(input) {
        try {
            await BillingJobLedgerModel.create({
                ...input,
                state: "PROCESSING",
            });

            return "ACQUIRED";
        } catch (error: unknown) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }

            const existing = await BillingJobLedgerModel.findOne({
                orgId: input.orgId,
                requestId: input.requestId,
                jobType: input.jobType,
            })
                .select({
                    _id: 0,
                    state: 1,
                })
                .lean<{ readonly state: BillingJobLedgerState }>()
                .exec();

            if (existing === null) {
                throw error;
            }

            return existing.state;
        }
    },
    async completeJobProcessing(input) {
        const completed = await BillingJobLedgerModel.findOneAndUpdate(
            {
                orgId: input.orgId,
                requestId: input.requestId,
                jobType: input.jobType,
                state: "PROCESSING",
            },
            {
                $set: {
                    state: "COMPLETED",
                    completedAt: input.completedAt,
                    outcome: input.outcome,
                },
            },
            {
                returnDocument: "after",
                runValidators: true,
            },
        ).exec();

        if (completed === null) {
            throw new Error("Billing job processing claim was lost.");
        }
    },
    async releaseJobProcessing(input) {
        await BillingJobLedgerModel.deleteOne({
            ...input,
            state: "PROCESSING",
        }).exec();
    },
};

function isDuplicateKeyError(error: unknown): error is { readonly code: 11000 } {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === 11000;
}
