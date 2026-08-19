import { pathToFileURL } from "node:url";

import { AlertModel } from "../features/alerts/alert.model.js";
import { AnalyticsDailyAggregateModel } from
    "../features/analytics/analytics-daily.model.js";
import { AnalyticsJobLedgerModel } from
    "../features/analytics/analytics-job-ledger.model.js";
import { RefreshTokenModel } from
    "../features/auth/refresh-token.model.js";
import { BillingJobLedgerModel } from
    "../features/billing/billing-job-ledger.model.js";
import { BillingRollupModel } from
    "../features/billing/billing-rollup.model.js";
import { RequestLogModel } from
    "../features/billing/request-log.model.js";
import { ConversationModel } from
    "../features/conversations/conversation.model.js";
import { MessageModel } from "../features/messages/message.model.js";
import { OrganisationModel } from
    "../features/organisations/organisation.model.js";
import { EnqueueRecoveryModel } from
    "../features/recovery/enqueue-recovery.model.js";
import { TeamModel } from "../features/teams/team.model.js";
import { UserModel } from "../features/users/user.model.js";
import { logger } from "../shared/lib/logger.js";
import { connectMongo, disconnectMongo } from "../shared/lib/mongo.js";

interface IndexableModel {
    readonly modelName: string;
    createIndexes(): Promise<unknown>;
}

const deploymentModels: readonly IndexableModel[] = Object.freeze([
    OrganisationModel,
    UserModel,
    TeamModel,
    RefreshTokenModel,
    ConversationModel,
    MessageModel,
    RequestLogModel,
    BillingRollupModel,
    BillingJobLedgerModel,
    AnalyticsDailyAggregateModel,
    AnalyticsJobLedgerModel,
    AlertModel,
    EnqueueRecoveryModel,
]);

export async function deployIndexes(
    models: readonly IndexableModel[] = deploymentModels,
): Promise<void> {
    for (const model of models) {
        await model.createIndexes();
        logger.info(
            {
                event: "mongodb.indexes.created",
                model: model.modelName,
            },
            "MongoDB indexes created",
        );
    }
}

async function main(): Promise<void> {
    try {
        await connectMongo();
        await deployIndexes();
        logger.info(
            {
                event: "mongodb.index_deployment.completed",
                modelCount: deploymentModels.length,
            },
            "MongoDB index deployment completed",
        );
    } catch {
        process.exitCode = 1;
        logger.error(
            {
                errorCode: "MONGODB_INDEX_DEPLOYMENT_FAILED",
                event: "mongodb.index_deployment.failed",
            },
            "MongoDB index deployment failed",
        );
    } finally {
        try {
            await disconnectMongo();
        } catch {
            process.exitCode = 1;
            logger.error(
                {
                    errorCode: "MONGODB_DISCONNECT_FAILED",
                    event: "mongodb.disconnect.failed",
                },
                "MongoDB disconnect failed",
            );
        }
    }
}

if (
    process.argv[1] !== undefined
    && import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await main();
}
