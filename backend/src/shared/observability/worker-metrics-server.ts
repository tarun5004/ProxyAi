import { createServer, type Server } from "node:http";

import { runtimeEnv } from "../../config/runtime-env.js";
import { logger } from "../lib/logger.js";
import { refreshDependencyReadinessMetrics } from "./dependency-metrics.js";
import { metricsRegistry } from "./metrics.js";

const WORKER_METRICS_HOST = "0.0.0.0";

let workerMetricsServer: Server | undefined;

export interface WorkerMetricsServerOptions {
    readonly host?: string;
    readonly port?: number;
}

export async function startWorkerMetricsServer(
    options: WorkerMetricsServerOptions = {},
): Promise<Server> {
    if (workerMetricsServer !== undefined) {
        return workerMetricsServer;
    }

    const host = options.host ?? WORKER_METRICS_HOST;
    const port = options.port ?? runtimeEnv.WORKER_METRICS_PORT;
    const server = createServer(async (request, response) => {
        if (request.method !== "GET" || request.url?.split("?", 1)[0] !== "/metrics") {
            response.writeHead(404).end();
            return;
        }

        try {
            refreshDependencyReadinessMetrics();
            response.writeHead(200, {
                "Content-Type": metricsRegistry.contentType,
            });
            response.end(await metricsRegistry.metrics());
        } catch {
            response.writeHead(503, {
                "Content-Type": "text/plain; charset=utf-8",
            });
            response.end("Metrics temporarily unavailable.\n");
        }
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            resolve();
        });
    });

    workerMetricsServer = server;
    logger.info(
        {
            event: "worker.metrics.started",
            port,
        },
        "Worker metrics listener started",
    );

    return server;
}

export async function closeWorkerMetricsServer(): Promise<boolean> {
    const server = workerMetricsServer;

    if (server === undefined) {
        return true;
    }

    workerMetricsServer = undefined;

    try {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
        logger.info(
            { event: "worker.metrics.stopped" },
            "Worker metrics listener stopped",
        );
        return true;
    } catch {
        logger.error(
            {
                errorCode: "WORKER_METRICS_CLOSE_FAILED",
                event: "worker.metrics.stop_failed",
            },
            "Worker metrics listener failed to stop",
        );
        return false;
    }
}
