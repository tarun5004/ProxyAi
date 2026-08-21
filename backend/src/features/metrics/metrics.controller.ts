import type { Request, Response } from "express";

import { refreshDependencyReadinessMetrics } from "../../shared/observability/dependency-metrics.js";
import { metricsRegistry } from "../../shared/observability/metrics.js";

export async function getMetrics(
    _request: Request,
    response: Response,
): Promise<void> {
    refreshDependencyReadinessMetrics();
    response.status(200);
    response.set("Content-Type", metricsRegistry.contentType);
    response.send(await metricsRegistry.metrics());
}
