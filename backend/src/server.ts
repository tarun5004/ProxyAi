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

let server: Server | undefined;
let shutdownStarted = false;

async function startApi(): Promise<void> {
    await Promise.all([connectMongo(), connectRedis()]);
    await connectApiAsyncInfrastructure();

    if (shutdownStarted) {
        return;
    }

    server = await listen();

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

    const httpClosed = await closeHttpServer();
    const infrastructureClosed = await disconnectInfrastructure();

    if (!httpClosed || !infrastructureClosed) {
        process.exitCode = 1;
    }

    logger.info(
        {
            event: "app.shutdown.completed",
        },
        "Application shutdown completed",
    );
}

function listen(): Promise<Server> {
    return new Promise((resolve, reject) => {
        const listeningServer = app.listen(env.PORT, () => {
            listeningServer.off("error", reject);
            resolve(listeningServer);
        });

        listeningServer.once("error", reject);
    });
}

async function closeHttpServer(): Promise<boolean> {
    if (server === undefined) {
        return true;
    }

    try {
        await new Promise<void>((resolve, reject) => {
            server?.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        return true;
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

void startApi().catch(async () => {
    process.exitCode = 1;
    logger.error(
        {
            errorCode: "API_START_FAILED",
            event: "app.startup.failed",
        },
        "ProxiAI API startup failed",
    );
    await shutdown("STARTUP_FAILURE");
});
