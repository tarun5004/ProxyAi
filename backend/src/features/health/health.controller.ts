import type { Request, Response } from "express";

import { serviceMetadata } from "../../config/service.js";
import { isMongoReady } from "../../shared/lib/mongo.js";
import { isRedisReady } from "../../shared/lib/redis.js";
import { recordDependencyReadiness } from "../../shared/observability/dependency-metrics.js";
import { isApiRuntimeReady } from "../../shared/runtime/api-runtime-state.js";

type DependencyStatus = "up" | "down";

function getDeploymentMetadata() {
    return {
        service: serviceMetadata.name,
        version: serviceMetadata.version,
        ...("commitSha" in serviceMetadata
            ? { commitSha: serviceMetadata.commitSha }
            : {}),
    };
}

export function getLiveness(_request: Request, response: Response): void {
    response.status(200).json({
        status: "ok",
        ...getDeploymentMetadata(),
        time: new Date().toISOString(),
    });
}

export function getReadiness(_request: Request, response: Response): void {
    const mongo: DependencyStatus = isMongoReady() ? "up" : "down";
    const redis: DependencyStatus = isRedisReady() ? "up" : "down";
    const runtime: DependencyStatus = isApiRuntimeReady() ? "up" : "down";
    const isReady = mongo === "up" && redis === "up" && runtime === "up";

    recordDependencyReadiness(mongo === "up", redis === "up");

    response.status(isReady ? 200 : 503).json({
        status: isReady ? "ready" : "not_ready",
        ...getDeploymentMetadata(),
        checks: {
            mongo,
            redis,
            runtime,
        },
        time: new Date().toISOString(),
    });
}
