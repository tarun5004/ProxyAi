import type {
    AnalyticsRequestOutcomeJob,
    RequestOutcomeStatus,
} from "../../shared/async/job-contract.js";
import { RequestLogModel } from "../billing/request-log.model.js";
import type { ProviderId } from "../providers/provider.types.js";
import { AnalyticsDailyAggregateModel } from "./analytics-daily.model.js";
import { AnalyticsJobLedgerModel } from "./analytics-job-ledger.model.js";
import type {
    AnalyticsAggregateScope,
    AnalyticsAggregateValues,
    AnalyticsDailyAggregateDocument,
    AnalyticsJobLedgerRecord,
    AnalyticsJobLedgerState,
} from "./analytics.types.js";

interface AnalyticsSummaryRow {
    readonly totalRequests: number;
    readonly successfulRequests: number;
    readonly blockedRequests: number;
    readonly maskedRequests: number;
    readonly failedRequests: number;
    readonly interruptedRequests: number;
    readonly knownUsageRequestCount: number;
    readonly unknownUsageRequestCount: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
}

interface ProviderModelRow {
    readonly _id: {
        readonly providerId: ProviderId;
        readonly model: string;
    };
    readonly requestCount: number;
}

export interface AnalyticsRepository {
    acquireJobProcessing(input: {
        orgId: string;
        requestId: string;
        jobType: AnalyticsRequestOutcomeJob["jobType"];
        processingStartedAt: Date;
    }): Promise<"ACQUIRED" | AnalyticsJobLedgerState>;
    completeJobProcessing(input: {
        orgId: string;
        requestId: string;
        jobType: AnalyticsRequestOutcomeJob["jobType"];
        completedAt: Date;
    }): Promise<void>;
    releaseJobProcessing(input: {
        orgId: string;
        requestId: string;
        jobType: AnalyticsRequestOutcomeJob["jobType"];
    }): Promise<void>;
    findRequestOutcome(
        orgId: string,
        requestId: string,
    ): Promise<{
        readonly status: RequestOutcomeStatus;
        readonly policyAction: "ALLOW" | "ALLOW_WITH_MASK" | "BLOCK";
        readonly providerId?: ProviderId;
        readonly model?: string;
    } | null>;
    aggregateDaily(input: {
        orgId: string;
        userId?: string;
        start: Date;
        end: Date;
    }): Promise<AnalyticsAggregateValues>;
    upsertDailyAggregate(input: {
        orgId: string;
        date: string;
        scope: AnalyticsAggregateScope;
        userId?: string;
        values: AnalyticsAggregateValues;
    }): Promise<AnalyticsDailyAggregateDocument>;
}

const canonicalStatuses: readonly RequestOutcomeStatus[] = [
    "COMPLETED",
    "BLOCKED",
    "FAILED",
    "INTERRUPTED",
];

export const analyticsRepository: AnalyticsRepository = {
    async acquireJobProcessing(input) {
        try {
            await AnalyticsJobLedgerModel.create({
                ...input,
                state: "PROCESSING",
            });

            return "ACQUIRED";
        } catch (error: unknown) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }

            const existing = await AnalyticsJobLedgerModel.findOne({
                orgId: input.orgId,
                requestId: input.requestId,
                jobType: input.jobType,
            })
                .select({
                    _id: 0,
                    state: 1,
                })
                .lean<Pick<AnalyticsJobLedgerRecord, "state">>()
                .exec();

            if (existing === null) {
                throw error;
            }

            return existing.state;
        }
    },
    async completeJobProcessing(input) {
        const completed = await AnalyticsJobLedgerModel.findOneAndUpdate(
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
                },
            },
            {
                returnDocument: "after",
                runValidators: true,
            },
        ).exec();

        if (completed === null) {
            throw new Error("Analytics job processing claim was lost.");
        }
    },
    async releaseJobProcessing(input) {
        await AnalyticsJobLedgerModel.deleteOne({
            ...input,
            state: "PROCESSING",
        }).exec();
    },
    async findRequestOutcome(orgId, requestId) {
        return RequestLogModel.findOne({
            orgId,
            requestId,
        })
            .select({
                _id: 0,
                status: 1,
                policyAction: 1,
                providerId: 1,
                model: 1,
            })
            .lean<{
                readonly status: RequestOutcomeStatus;
                readonly policyAction:
                    "ALLOW" | "ALLOW_WITH_MASK" | "BLOCK";
                readonly providerId?: ProviderId;
                readonly model?: string;
            }>()
            .exec();
    },
    async aggregateDaily(input) {
        const match = createRequestLogMatch(input);
        const usageKnown = {
            $and: [
                { $isNumber: "$inputTokens" },
                { $isNumber: "$outputTokens" },
                { $isNumber: "$totalTokens" },
            ],
        } as const;
        const summaryRows = await RequestLogModel.aggregate<
            AnalyticsSummaryRow
        >([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalRequests: { $sum: 1 },
                    successfulRequests: statusCount("COMPLETED"),
                    blockedRequests: statusCount("BLOCKED"),
                    failedRequests: statusCount("FAILED"),
                    interruptedRequests: statusCount("INTERRUPTED"),
                    maskedRequests: {
                        $sum: {
                            $cond: [
                                { $eq: ["$policyAction", "ALLOW_WITH_MASK"] },
                                1,
                                0,
                            ],
                        },
                    },
                    knownUsageRequestCount: {
                        $sum: {
                            $cond: [usageKnown, 1, 0],
                        },
                    },
                    unknownUsageRequestCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ["$status", "BLOCKED"] },
                                        { $not: [usageKnown] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    inputTokens: knownTokenSum("$inputTokens", usageKnown),
                    outputTokens: knownTokenSum("$outputTokens", usageKnown),
                    totalTokens: knownTokenSum("$totalTokens", usageKnown),
                },
            },
        ]).exec();
        const providerRows = await RequestLogModel.aggregate<
            ProviderModelRow
        >([
            {
                $match: {
                    ...match,
                    status: {
                        $in: ["COMPLETED", "FAILED", "INTERRUPTED"],
                    },
                    providerId: { $exists: true },
                    model: { $exists: true },
                },
            },
            {
                $group: {
                    _id: {
                        providerId: "$providerId",
                        model: "$model",
                    },
                    requestCount: { $sum: 1 },
                },
            },
            {
                $sort: {
                    "_id.providerId": 1,
                    "_id.model": 1,
                },
            },
        ]).exec();
        const summary = summaryRows[0] ?? emptySummary();

        return {
            totalRequests: summary.totalRequests,
            successfulRequests: summary.successfulRequests,
            blockedRequests: summary.blockedRequests,
            maskedRequests: summary.maskedRequests,
            failedRequests: summary.failedRequests,
            interruptedRequests: summary.interruptedRequests,
            knownUsageRequestCount: summary.knownUsageRequestCount,
            unknownUsageRequestCount: summary.unknownUsageRequestCount,
            inputTokens: summary.inputTokens,
            outputTokens: summary.outputTokens,
            totalTokens: summary.totalTokens,
            providerModelRequestCounts: providerRows.map((row) => ({
                providerId: row._id.providerId,
                model: row._id.model,
                requestCount: row.requestCount,
            })),
        };
    },
    async upsertDailyAggregate(input) {
        const key = createAggregateKey(input);
        const queryKey = {
            ...key,
            ...(input.userId === undefined
                ? { userId: { $exists: false } }
                : {}),
        };
        const document = {
            ...key,
            ...input.values,
            providerModelRequestCounts:
                input.values.providerModelRequestCounts.map(
                    (entry) => ({ ...entry }),
                ),
        };
        const updated = await AnalyticsDailyAggregateModel.findOneAndUpdate(
            {
                ...queryKey,
                totalRequests: {
                    $lte: input.values.totalRequests,
                },
            },
            {
                $set: document,
            },
            {
                returnDocument: "after",
                runValidators: true,
            },
        ).exec();

        if (updated !== null) {
            return updated;
        }

        const existing = await AnalyticsDailyAggregateModel.findOne(
            queryKey,
        ).exec();

        if (existing !== null) {
            return existing;
        }

        try {
            return await AnalyticsDailyAggregateModel.create(document);
        } catch (error: unknown) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }

            return AnalyticsDailyAggregateModel.findOne(queryKey).orFail();
        }
    },
};

function createRequestLogMatch(input: {
    readonly orgId: string;
    readonly userId?: string;
    readonly start: Date;
    readonly end: Date;
}) {
    return {
        orgId: input.orgId,
        ...(input.userId === undefined ? {} : { userId: input.userId }),
        status: {
            $in: canonicalStatuses,
        },
        createdAt: {
            $gte: input.start,
            $lt: input.end,
        },
    };
}

function createAggregateKey(input: {
    readonly orgId: string;
    readonly date: string;
    readonly scope: AnalyticsAggregateScope;
    readonly userId?: string;
}) {
    return {
        orgId: input.orgId,
        date: input.date,
        scope: input.scope,
        ...(input.userId === undefined ? {} : { userId: input.userId }),
    };
}

function statusCount(status: RequestOutcomeStatus) {
    return {
        $sum: {
            $cond: [{ $eq: ["$status", status] }, 1, 0],
        },
    } as const;
}

function knownTokenSum(
    field: "$inputTokens" | "$outputTokens" | "$totalTokens",
    usageKnown: object,
) {
    return {
        $sum: {
            $cond: [usageKnown, field, 0],
        },
    } as const;
}

function emptySummary(): AnalyticsSummaryRow {
    return {
        totalRequests: 0,
        successfulRequests: 0,
        blockedRequests: 0,
        maskedRequests: 0,
        failedRequests: 0,
        interruptedRequests: 0,
        knownUsageRequestCount: 0,
        unknownUsageRequestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
    };
}

function isDuplicateKeyError(error: unknown): error is { readonly code: 11000 } {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === 11000;
}
