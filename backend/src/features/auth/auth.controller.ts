import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { createSuccessResponse } from "../../shared/responses/api-response.js";
import { authService } from "./auth.service.js";
import { loginRateLimiter } from "./login-rate-limit.service.js";
import { loginRequestSchema } from "./login.schema.js";
import {
    getRefreshCookieOptions,
    REFRESH_COOKIE_NAME,
} from "./refresh-token.service.js";

export async function login(
    request: Request,
    response: Response,
): Promise<void> {
    const parsedRequest = loginRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
        throw new AppError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed.",
            parsedRequest.error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
            })),
        );
    }

    const ipAddress =
        request.ip
        || request.socket.remoteAddress
        || "unknown";

    try {
        await loginRateLimiter.consume({
            ipAddress,
            organisationSlug:
                parsedRequest.data.organisationSlug,
            emailNormalized:
                parsedRequest.data.emailNormalized,
        });
    } catch (error: unknown) {
        if (
            error instanceof AppError
            && error.code === "DEPENDENCY_UNAVAILABLE"
        ) {
            request.log.error(
                {
                    event: "auth.login_operational_error",
                    reasonCode: "RATE_LIMIT_UNAVAILABLE",
                },
                "Login operation failed",
            );
        } else if (
            error instanceof AppError
            && error.code === "RATE_LIMITED"
        ) {
            request.log.warn(
                {
                    event: "auth.login_failed",
                    reasonCode: "RATE_LIMITED",
                },
                "Login failed",
            );
        }

        throw error;
    }

    const result = await authService.login(
        parsedRequest.data,
        request.log,
    );

    response.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        getRefreshCookieOptions(),
    );
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(
        createSuccessResponse(
            {
                accessToken: result.accessToken,
                expiresInSeconds: result.expiresInSeconds,
                user: result.user,
            },
            request.requestId,
        ),
    );
}
