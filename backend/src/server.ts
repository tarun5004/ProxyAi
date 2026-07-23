import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./shared/lib/logger.js";
import { connectMongo, disconnectMongo } from "./shared/lib/mongo.js";

const server = app.listen(env.PORT, () => {
    logger.info(
        {
            event: "app.started",
            port: env.PORT,
        },
        "ProxiAI API started",
    );
});

let shutdownStarted = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shutdownStarted) {
        return;
    }

    shutdownStarted = true;

    logger.info(
        {
            event: "app.shutdown.started",
            signal,
        },
        "Application shutdown started",
    );

    server.close(async (error) => {
        if (error) {
            process.exitCode = 1;

            logger.error(
                {
                    errorCode: "HTTP_SERVER_CLOSE_FAILED",
                    event: "app.shutdown.failed",
                },
                "HTTP server failed to close",
            );
        }

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

        logger.info(
            {
                event: "app.shutdown.completed",
            },
            "Application shutdown completed",
        );
    });
}

process.once("SIGINT", () => {
    void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
});

void connectMongo().catch(() => undefined);
