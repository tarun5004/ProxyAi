import type { Server } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectApiAsyncInfrastructure } from
    "./shared/async/runtime.js";
import { logger } from "./shared/lib/logger.js";
import { connectMongo } from "./shared/lib/mongo.js";
import { connectRedis } from "./shared/lib/redis.js";
import { disconnectInfrastructure } from
    "./shared/runtime/infrastructure.js";
import { openApiListener, API_LISTEN_HOST } from
    "./shared/runtime/api-listener.js";
import {
    shutdownApiRuntime,
    startApiRuntime,
} from "./shared/runtime/api-startup.js";
import { closeHttpServerWithinGrace } from
    "./shared/runtime/http-server-shutdown.js";
import {
    ApiStartupStageError,
} from "./shared/runtime/startup-stage.js";
import { initializeEncryption } from "./shared/security/encryption.js";
import { assertEncryptionStorageReady } from "./shared/security/encryption-readiness.js";

let server: Server | undefined;
let shutdownStarted = false;

async function startApi(): Promise<void> {
    const ready = await startApiRuntime({
        initializeEncryption,
        startHttpListener: async () => {
            server = await openApiListener(
                (port, host, onListening) => app.listen(
                    port,
                    host,
                    onListening,
                ),
                env.PORT,
            );
            logger.info(
                {
                    event: "app.listening",
                    host: API_LISTEN_HOST,
                    port: env.PORT,
                },
                "ProxiAI API listener started",
            );
        },
        connectMongo,
        connectRedis,
        assertEncryptionStorageReady,
        connectAsyncInfrastructure: connectApiAsyncInfrastructure,
        isShutdownRequested: () => shutdownStarted,
    });

    if (!ready) {
        return;
    }

    logger.info(
        {
            event: "app.started",
            port: env.PORT,
        },
        "ProxiAI API started",
    );
}

async function shutdown(
    reason: NodeJS.Signals | "STARTUP_FAILURE",
): Promise<void> {
    if (shutdownStarted) {
        return;
    }

    shutdownStarted = true;
    logger.info(
        {
            event: "app.shutdown.started",
            reason,
        },
        "Application shutdown started",
    );

    const closed = await shutdownApiRuntime({
        closeHttpServer,
        disconnectInfrastructure,
    });

    if (!closed) {
        process.exitCode = 1;
    }

    logger.info(
        {
            event: "app.shutdown.completed",
        },
        "Application shutdown completed",
    );
}

async function closeHttpServer(): Promise<boolean> {
    if (server === undefined) {
        return true;
    }

    try {
        const result = await closeHttpServerWithinGrace(server);

        if (result.forced) {
            logger.warn(
                {
                    abortedStreams: result.abortedStreams,
                    event: "app.shutdown.forced",
                },
                "Application forced remaining HTTP connections closed",
            );
        }

        return result.closed;
    } catch {
        logger.error(
            {
                errorCode: "HTTP_SERVER_CLOSE_FAILED",
                event: "app.shutdown.failed",
            },
            "HTTP server failed to close",
        );

        return false;
    }
}

process.once("SIGINT", () => {
    void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
});

void startApi().catch(async (error: unknown) => {
    process.exitCode = 1;
    const startupError = error instanceof ApiStartupStageError
        ? error
        : undefined;

    logger.error(
        {
            errorCode: startupError?.errorCode ?? "API_START_FAILED",
            event: "app.startup.failed",
            startupStage: startupError?.startupStage ?? "unknown",
        },
        "ProxiAI API startup failed",
    );
    await shutdown("STARTUP_FAILURE");
});
