import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error.js";
import { getApiRuntimeState } from "../runtime/api-runtime-state.js";

export function requireApiRuntimeReady(
    _request: Request,
    _response: Response,
    next: NextFunction,
): void {
    const runtimeState = getApiRuntimeState();

    if (runtimeState === "READY") {
        next();
        return;
    }

    if (runtimeState === "STARTING") {
        next(new AppError(
            503,
            "SERVICE_STARTING",
            "Service is starting. Please retry shortly.",
        ));
        return;
    }

    next(new AppError(
        503,
        "SERVICE_UNAVAILABLE",
        "Service is temporarily unavailable.",
    ));
}
