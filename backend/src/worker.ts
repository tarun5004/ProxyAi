import { startWorkerAsyncInfrastructure } from
    "./shared/async/runtime.js";
import { logger } from "./shared/lib/logger.js";
import { connectMongo } from "./shared/lib/mongo.js";
import { connectRedis } from "./shared/lib/redis.js";
import { disconnectInfrastructure } from
    "./shared/runtime/infrastructure.js";

let shutdownStarted = false;

async function startWorker(): Promise<void> {
    await Promise.all([connectMongo(), connectRedis()]);
    await startWorkerAsyncInfrastructure();

    logger.info(
        {
            event: "worker.started",
            workerType: "async",
        },
        "ProxiAI worker started",
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
            event: "worker.shutdown.started",
            reason,
            workerType: "async",
        },
        "Worker shutdown started",
    );

    if (!await disconnectInfrastructure()) {
        process.exitCode = 1;
    }

    logger.info(
        {
            event: "worker.shutdown.completed",
            workerType: "async",
        },
        "Worker shutdown completed",
    );
}

process.once("SIGINT", () => {
    void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
});

void startWorker().catch(async () => {
    process.exitCode = 1;
    logger.error(
        {
            errorCode: "WORKER_START_FAILED",
            event: "worker.startup.failed",
            workerType: "async",
        },
        "ProxiAI worker startup failed",
    );
    await shutdown("STARTUP_FAILURE");
});
