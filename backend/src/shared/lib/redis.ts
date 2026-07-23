import { Redis } from "ioredis";

import { env } from "../../config/env.js";
import { logger } from "./logger.js";

export const REDIS_MAX_RECONNECT_ATTEMPTS = 5;
export const REDIS_MAX_RECONNECT_DELAY_MS = 1_000;

export function getRedisReconnectDelay(attempt: number): number | null {
    if (attempt > REDIS_MAX_RECONNECT_ATTEMPTS) {
        return null;
    }

    return Math.min(attempt * 200, REDIS_MAX_RECONNECT_DELAY_MS);
}

export const redis = new Redis(env.REDIS_URL, {
    enableOfflineQueue: false,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: getRedisReconnectDelay,
});

let connectionPromise: Promise<void> | undefined;
let disconnectRequested = false;

redis.on("ready", () => {
    logger.info(
        {
            event: "redis.connected",
        },
        "Redis connected",
    );
});

redis.on("reconnecting", (delayMs: number) => {
    logger.warn(
        {
            delayMs,
            event: "redis.reconnecting",
        },
        "Redis reconnect scheduled",
    );
});

redis.on("error", () => {
    logger.error(
        {
            errorCode: "REDIS_CONNECTION_ERROR",
            event: "redis.connection.error",
        },
        "Redis connection error",
    );
});

redis.on("end", () => {
    if (disconnectRequested) {
        return;
    }

    logger.warn(
        {
            event: "redis.disconnected",
        },
        "Redis connection ended",
    );
});

export function isRedisReady(): boolean {
    return redis.status === "ready";
}

export async function connectRedis(): Promise<void> {
    if (isRedisReady()) {
        return;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    disconnectRequested = false;

    logger.info(
        {
            event: "redis.connection.started",
        },
        "Redis connection started",
    );

    connectionPromise = redis.connect();

    try {
        await connectionPromise;
    } catch (error: unknown) {
        logger.error(
            {
                errorCode: "REDIS_CONNECTION_FAILED",
                event: "redis.connection.failed",
            },
            "Redis connection failed",
        );

        throw error;
    } finally {
        connectionPromise = undefined;
    }
}

export async function disconnectRedis(): Promise<void> {
    disconnectRequested = true;

    if (connectionPromise) {
        redis.disconnect();
        await connectionPromise.catch(() => undefined);
    }

    if (redis.status === "ready") {
        await redis.quit();
    } else if (redis.status !== "end") {
        redis.disconnect();
    }

    logger.info(
        {
            event: "redis.disconnected",
        },
        "Redis disconnected",
    );
}
