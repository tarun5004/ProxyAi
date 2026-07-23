import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { logger } from "../lib/logger.js";

export function requestIdMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
): void {
    const requestId = randomUUID();

    request.requestId = requestId;
    request.log = logger.child({ requestId });
    response.setHeader("X-Request-ID", requestId);

    next();
}
