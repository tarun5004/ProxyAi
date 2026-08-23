import {
    markApiRuntimeFailed,
    markApiRuntimeReady,
    markApiRuntimeStarting,
    markApiRuntimeStopping,
} from "./api-runtime-state.js";
import { runApiStartupStage } from "./startup-stage.js";

export interface ApiStartupOperations {
    readonly initializeEncryption: () => void;
    readonly startHttpListener: () => Promise<void>;
    readonly connectMongo: () => Promise<void>;
    readonly connectRedis: () => Promise<void>;
    readonly assertEncryptionStorageReady: () => Promise<void>;
    readonly connectAsyncInfrastructure: () => Promise<void>;
    readonly isShutdownRequested: () => boolean;
}

export async function startApiRuntime(
    operations: ApiStartupOperations,
): Promise<boolean> {
    markApiRuntimeStarting();

    try {
        await runApiStartupStage(
            "encryption_initialization",
            "ENCRYPTION_INITIALIZATION_FAILED",
            operations.initializeEncryption,
        );
        await runApiStartupStage(
            "http_listener",
            "HTTP_LISTENER_START_FAILED",
            operations.startHttpListener,
        );

        if (operations.isShutdownRequested()) {
            return false;
        }

        await Promise.all([
            runApiStartupStage(
                "mongo_connection",
                "MONGODB_CONNECTION_FAILED",
                operations.connectMongo,
            ),
            runApiStartupStage(
                "redis_connection",
                "REDIS_CONNECTION_FAILED",
                operations.connectRedis,
            ),
        ]);
        await runApiStartupStage(
            "encryption_readiness",
            "ENCRYPTION_READINESS_FAILED",
            operations.assertEncryptionStorageReady,
        );
        await runApiStartupStage(
            "async_infrastructure",
            "ASYNC_INFRASTRUCTURE_CONNECTION_FAILED",
            operations.connectAsyncInfrastructure,
        );

        if (operations.isShutdownRequested()) {
            return false;
        }

        markApiRuntimeReady();
        return true;
    } catch (error: unknown) {
        markApiRuntimeFailed();
        throw error;
    }
}

export async function shutdownApiRuntime(operations: {
    readonly closeHttpServer: () => Promise<boolean>;
    readonly disconnectInfrastructure: () => Promise<boolean>;
}): Promise<boolean> {
    markApiRuntimeStopping();

    const httpClosed = await operations.closeHttpServer();
    const infrastructureClosed = await operations.disconnectInfrastructure();

    return httpClosed && infrastructureClosed;
}
