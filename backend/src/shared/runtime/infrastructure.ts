import { disconnectBullMq } from "../async/bullmq.js";
import { logger } from "../lib/logger.js";
import { disconnectMongo } from "../lib/mongo.js";
import { disconnectRedis } from "../lib/redis.js";

export async function disconnectInfrastructure(): Promise<boolean> {
    const resources = [
        {
            disconnect: disconnectBullMq,
            errorCode: "BULLMQ_DISCONNECT_FAILED",
            event: "queue.disconnect.failed",
            message: "BullMQ disconnect failed",
        },
        {
            disconnect: disconnectRedis,
            errorCode: "REDIS_DISCONNECT_FAILED",
            event: "redis.disconnect.failed",
            message: "Redis disconnect failed",
        },
        {
            disconnect: disconnectMongo,
            errorCode: "MONGODB_DISCONNECT_FAILED",
            event: "mongodb.disconnect.failed",
            message: "MongoDB disconnect failed",
        },
    ] as const;
    let successful = true;

    for (const resource of resources) {
        try {
            await resource.disconnect();
        } catch {
            successful = false;
            logger.error(
                {
                    errorCode: resource.errorCode,
                    event: resource.event,
                },
                resource.message,
            );
        }
    }

    return successful;
}
