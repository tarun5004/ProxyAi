import mongoose from "mongoose";

import { runtimeEnv } from "../../config/runtime-env.js";
import { logger } from "./logger.js";

export const MONGO_SERVER_SELECTION_TIMEOUT_MS = 5_000;

let connectionPromise: Promise<void> | undefined;

export function isMongoReady(): boolean {
    return mongoose.connection.readyState === 1;
}

export async function connectMongo(): Promise<void> {
    if (isMongoReady()) {
        return;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    connectionPromise = connect();

    try {
        await connectionPromise;
    } finally {
        connectionPromise = undefined;
    }
}

export async function disconnectMongo(): Promise<void> {
    if (connectionPromise) {
        await connectionPromise.catch(() => undefined);
    }

    if (mongoose.connection.readyState === 0) {
        return;
    }

    await mongoose.disconnect();

    logger.info(
        {
            event: "mongodb.disconnected",
        },
        "MongoDB disconnected",
    );
}

async function connect(): Promise<void> {
    logger.info(
        {
            event: "mongodb.connection.started",
        },
        "MongoDB connection started",
    );

    try {
        await mongoose.connect(runtimeEnv.MONGO_URI, {
            autoIndex: runtimeEnv.NODE_ENV !== "production",
            serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
        });

        logger.info(
            {
                event: "mongodb.connected",
            },
            "MongoDB connected",
        );
    } catch (error: unknown) {
        logger.error(
            {
                errorCode: "MONGODB_CONNECTION_FAILED",
                event: "mongodb.connection.failed",
            },
            "MongoDB connection failed",
        );

        throw error;
    }
}
