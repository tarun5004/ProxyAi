import { Types } from "mongoose";

import {
    REQUEST_COMPLETED_JOB_TYPE,
} from "../../shared/async/job-contract.js";
import { AnalyticsJobLedgerModel } from
    "../analytics/analytics-job-ledger.model.js";
import { BillingJobLedgerModel } from
    "../billing/billing-job-ledger.model.js";
import { RequestLogModel } from "../billing/request-log.model.js";
import { OrganisationModel } from
    "../organisations/organisation.model.js";
import { EnqueueRecoveryModel } from "./enqueue-recovery.model.js";
import type {
    EnqueueRecoveryErrorCategory,
    EnqueueRecoveryJobType,
    EnqueueRecoveryQueueName,
    EnqueueRecoveryRecord,
    RecoveryRequestSource,
} from "./enqueue-recovery.types.js";

export interface EnqueueRecoveryScope {
    readonly orgId: string;
    readonly requestId: string;
    readonly queueName: EnqueueRecoveryQueueName;
    readonly jobType: EnqueueRecoveryJobType;
}

export type BusinessLedgerState = "PROCESSING" | "COMPLETED" | undefined;

export interface EnqueueRecoveryRepository {
    listOrganisationIds(): Promise<readonly string[]>;
    listRequestLogBatch(
        orgId: string,
        afterCursor: string | undefined,
        limit: number,
    ): Promise<readonly RecoveryRequestSource[]>;
    findRequestSource(
        orgId: string,
        requestId: string,
    ): Promise<RecoveryRequestSource | undefined>;
    ensurePending(
        scope: EnqueueRecoveryScope,
        now: Date,
        errorCategory?: EnqueueRecoveryErrorCategory,
    ): Promise<void>;
    listOpen(
        orgId: string,
        now: Date,
        limit: number,
    ): Promise<readonly EnqueueRecoveryRecord[]>;
    findBusinessLedgerState(
        scope: EnqueueRecoveryScope,
    ): Promise<BusinessLedgerState>;
    claimAttempt(
        scope: EnqueueRecoveryScope,
        now: Date,
        claimUntil: Date,
    ): Promise<EnqueueRecoveryRecord | undefined>;
    markEnqueued(
        scope: EnqueueRecoveryScope,
        nextAttemptAt: Date,
    ): Promise<void>;
    markPendingRetry(
        scope: EnqueueRecoveryScope,
        nextAttemptAt: Date,
        errorCategory: EnqueueRecoveryErrorCategory,
    ): Promise<void>;
    markCompleted(scope: EnqueueRecoveryScope, now: Date): Promise<void>;
    markFailed(
        scope: EnqueueRecoveryScope,
        now: Date,
        errorCategory: EnqueueRecoveryErrorCategory,
    ): Promise<void>;
}

export const enqueueRecoveryRepository: EnqueueRecoveryRepository = {
    async listOrganisationIds() {
        const organisations = await OrganisationModel.find({})
            .select({ _id: 0, orgId: 1 })
            .lean()
            .exec();

        return organisations.map((organisation) => organisation.orgId);
    },

    async listRequestLogBatch(orgId, afterCursor, limit) {
        const cursorFilter = afterCursor === undefined
            ? {}
            : { _id: { $gt: new Types.ObjectId(afterCursor) } };
        const records = await RequestLogModel.find({
            orgId,
            ...cursorFilter,
        })
            .sort({ _id: 1 })
            .limit(limit)
            .lean()
            .exec();

        return records.map((record) => toRecoverySource(record));
    },

    async findRequestSource(orgId, requestId) {
        const record = await RequestLogModel.findOne({ orgId, requestId })
            .lean()
            .exec();

        return record === null ? undefined : toRecoverySource(record);
    },

    async ensurePending(scope, now, errorCategory) {
        await EnqueueRecoveryModel.updateOne(
            scope,
            {
                $setOnInsert: {
                    ...scope,
                    state: "PENDING",
                    attemptCount: 0,
                    nextAttemptAt: now,
                    ...(errorCategory === undefined
                        ? {}
                        : { errorCategory }),
                },
            },
            { upsert: true, runValidators: true },
        ).exec();
    },

    async listOpen(orgId, now, limit) {
        return EnqueueRecoveryModel.find({
            orgId,
            state: { $in: ["PENDING", "ENQUEUED"] },
            $or: [
                { nextAttemptAt: { $exists: false } },
                { nextAttemptAt: { $lte: now } },
            ],
        })
            .sort({ nextAttemptAt: 1, createdAt: 1 })
            .limit(limit)
            .lean()
            .exec();
    },

    async findBusinessLedgerState(scope) {
        if (scope.queueName === "billing-queue") {
            const ledger = await BillingJobLedgerModel.findOne({
                orgId: scope.orgId,
                requestId: scope.requestId,
                jobType: REQUEST_COMPLETED_JOB_TYPE,
            })
                .select({ _id: 0, state: 1 })
                .lean()
                .exec();

            return ledger?.state;
        }

        const ledger = await AnalyticsJobLedgerModel.findOne({
            orgId: scope.orgId,
            requestId: scope.requestId,
            jobType: scope.jobType,
        })
            .select({ _id: 0, state: 1 })
            .lean()
            .exec();

        return ledger?.state;
    },

    async claimAttempt(scope, now, claimUntil) {
        const record = await EnqueueRecoveryModel.findOneAndUpdate(
            {
                ...scope,
                state: { $in: ["PENDING", "ENQUEUED"] },
                attemptCount: { $lt: 3 },
                $or: [
                    { nextAttemptAt: { $exists: false } },
                    { nextAttemptAt: { $lte: now } },
                ],
            },
            {
                $set: {
                    state: "PENDING",
                    lastAttemptAt: now,
                    nextAttemptAt: claimUntil,
                },
                $inc: { attemptCount: 1 },
                $unset: {
                    completedAt: 1,
                    failedAt: 1,
                    errorCategory: 1,
                },
            },
            { returnDocument: "after", runValidators: true },
        )
            .lean()
            .exec();

        return record ?? undefined;
    },

    async markEnqueued(scope, nextAttemptAt) {
        await EnqueueRecoveryModel.updateOne(
            scope,
            {
                $set: { state: "ENQUEUED", nextAttemptAt },
                $unset: {
                    completedAt: 1,
                    failedAt: 1,
                    errorCategory: 1,
                },
            },
            { runValidators: true },
        ).exec();
    },

    async markPendingRetry(scope, nextAttemptAt, errorCategory) {
        await EnqueueRecoveryModel.updateOne(
            scope,
            {
                $set: {
                    state: "PENDING",
                    nextAttemptAt,
                    errorCategory,
                },
                $unset: { completedAt: 1, failedAt: 1 },
            },
            { runValidators: true },
        ).exec();
    },

    async markCompleted(scope, now) {
        await EnqueueRecoveryModel.updateOne(
            scope,
            {
                $set: { state: "COMPLETED", completedAt: now },
                $unset: {
                    nextAttemptAt: 1,
                    failedAt: 1,
                    errorCategory: 1,
                },
            },
            { runValidators: true },
        ).exec();
    },

    async markFailed(scope, now, errorCategory) {
        await EnqueueRecoveryModel.updateOne(
            scope,
            {
                $set: {
                    state: "FAILED",
                    failedAt: now,
                    errorCategory,
                },
                $unset: { nextAttemptAt: 1, completedAt: 1 },
            },
            { runValidators: true },
        ).exec();
    },
};

function toRecoverySource(record: {
    readonly _id: unknown;
    readonly requestId: string;
    readonly orgId: string;
    readonly userId: string;
    readonly status: RecoveryRequestSource["status"];
    readonly policyAction: RecoveryRequestSource["policyAction"];
    readonly providerId?: RecoveryRequestSource["providerId"];
    readonly model?: string;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
    readonly createdAt: Date;
}): RecoveryRequestSource {
    return Object.freeze({
        cursorId: String(record._id),
        requestId: record.requestId,
        orgId: record.orgId,
        userId: record.userId,
        status: record.status,
        policyAction: record.policyAction,
        ...(record.providerId === undefined
            ? {}
            : { providerId: record.providerId }),
        ...(record.model === undefined ? {} : { model: record.model }),
        ...(record.inputTokens === undefined
            ? {}
            : { inputTokens: record.inputTokens }),
        ...(record.outputTokens === undefined
            ? {}
            : { outputTokens: record.outputTokens }),
        ...(record.totalTokens === undefined
            ? {}
            : { totalTokens: record.totalTokens }),
        createdAt: record.createdAt,
    });
}
