import type { Request, Response } from "express";

import { metricsRegistry } from "../../shared/observability/metrics.js";

export async function getMetrics(
    _request: Request,
    response: Response,
): Promise<void> {
    response.status(200);
    response.set("Content-Type", metricsRegistry.contentType);
    response.send(await metricsRegistry.metrics());
}
