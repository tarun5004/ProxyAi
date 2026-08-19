import { randomUUID } from "node:crypto";

import { AlertModel } from "../alerts/alert.model.js";
import {
    ANOMALY_ALERT_SEVERITY,
    ANOMALY_ALERT_TYPE,
} from "../alerts/alert.types.js";
import { AnalyticsDailyAggregateModel } from
    "../analytics/analytics-daily.model.js";
import { OrganisationModel } from
    "../organisations/organisation.model.js";
import type {
    DailyAnomalyAlertDocument,
    DailyUserTokenUsage,
    UpsertDailyAnomalyAlertInput,
} from "./anomaly.types.js";

export interface AnomalyRepository {
    getFeatureState(orgId: string): Promise<boolean | null>;
    findDailyUsage(input: {
        orgId: string;
        userId: string;
        observedDay: string;
    }): Promise<DailyUserTokenUsage | null>;
    findPriorActiveDays(input: {
        orgId: string;
        userId: string;
        baselineWindowStart: string;
        observedDay: string;
    }): Promise<readonly DailyUserTokenUsage[]>;
    upsertDailyAnomalyAlert(
        input: UpsertDailyAnomalyAlertInput,
    ): Promise<DailyAnomalyAlertDocument>;
}

export const anomalyRepository: AnomalyRepository = {
    async getFeatureState(orgId) {
        const organisation = await OrganisationModel.findOne({ orgId })
            .select({
                _id: 0,
                "featureFlags.anomalyDetection": 1,
            })
            .lean<{
                readonly featureFlags: {
                    readonly anomalyDetection: boolean;
                };
            }>()
            .exec();

        return organisation?.featureFlags.anomalyDetection ?? null;
    },
    async findDailyUsage(input) {
        return AnalyticsDailyAggregateModel.findOne({
            orgId: input.orgId,
            userId: input.userId,
            date: input.observedDay,
            scope: "USER",
        })
            .select(dailyUsageProjection)
            .lean<DailyUserTokenUsage>()
            .exec();
    },
    async findPriorActiveDays(input) {
        return AnalyticsDailyAggregateModel.find({
            orgId: input.orgId,
            userId: input.userId,
            scope: "USER",
            date: {
                $gte: input.baselineWindowStart,
                $lt: input.observedDay,
            },
            knownUsageRequestCount: { $gt: 0 },
            unknownUsageRequestCount: 0,
        })
            .select(dailyUsageProjection)
            .sort({ date: 1 })
            .lean<DailyUserTokenUsage[]>()
            .exec();
    },
    async upsertDailyAnomalyAlert(input) {
        const filter = {
            orgId: input.orgId,
            userId: input.userId,
            observedDay: input.observedDay,
            type: ANOMALY_ALERT_TYPE,
        } as const;
        const update = {
            $setOnInsert: {
                alertId: randomUUID(),
                ...filter,
            },
            $set: {
                severity: ANOMALY_ALERT_SEVERITY,
                title: "Daily token usage anomaly",
                message:
                    "Daily token usage exceeded the approved rolling baseline.",
                metadata: { ...input.metadata },
                status: "OPEN",
            },
            $unset: {
                resolvedAt: 1,
            },
        } as const;

        try {
            return await AlertModel.findOneAndUpdate(filter, update, {
                returnDocument: "after",
                runValidators: true,
                upsert: true,
            }).orFail();
        } catch (error: unknown) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }

            return AlertModel.findOneAndUpdate(filter, update, {
                returnDocument: "after",
                runValidators: true,
            }).orFail();
        }
    },
};

const dailyUsageProjection = {
    _id: 0,
    date: 1,
    knownUsageRequestCount: 1,
    unknownUsageRequestCount: 1,
    totalTokens: 1,
} as const;

function isDuplicateKeyError(error: unknown): error is {
    readonly code: 11000;
} {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === 11000;
}
