import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error.js";

export function notFoundHandler(
    _request: Request,
    _response: Response,
    next: NextFunction,
): void {
    next(new AppError(404, "NOT_FOUND", "Route not found."));
}
