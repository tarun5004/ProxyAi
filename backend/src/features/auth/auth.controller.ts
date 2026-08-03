import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { createSuccessResponse } from "../../shared/responses/api-response.js";
import { authService } from "./auth.service.js";
import { loginRateLimiter } from "./login-rate-limit.service.js";
import { loginRequestSchema } from "./login.schema.js";
import {
    getRefreshCookieClearOptions,
    getRefreshCookieOptions,
    REFRESH_COOKIE_NAME,
} from "./refresh-token.service.js";

function getCookieValue(
    cookieHeader: string | undefined,
    cookieName: string,
): string | undefined {
    if (!cookieHeader) {
        return undefined;
    }

    for (const cookiePart of cookieHeader.split(";")) {
        const [name, ...valueParts] = cookiePart.trim().split("=");

        if (name === cookieName) {
            return valueParts.join("=");
        }
    }

    return undefined;
}

function createInvalidRefreshTokenError(): AppError {
    return new AppError(
        401,
        "INVALID_REFRESH_TOKEN",
        "Session is invalid or expired.",
    );
}

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

export async function refresh(
    request: Request,
    response: Response,
): Promise<void> {
    const rawRefreshToken = getCookieValue(
        request.headers.cookie,
        REFRESH_COOKIE_NAME,
    );

    if (!rawRefreshToken) {
        request.log.warn(
            {
                event: "auth.refresh_failed",
                reasonCode: "REFRESH_TOKEN_MISSING",
            },
            "Refresh failed",
        );
        response.clearCookie(
            REFRESH_COOKIE_NAME,
            getRefreshCookieClearOptions(),
        );

        throw createInvalidRefreshTokenError();
    }

    try {
        const result = await authService.refreshSession(
            rawRefreshToken,
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
                },
                request.requestId,
            ),
        );
    } catch (error: unknown) {
        response.clearCookie(
            REFRESH_COOKIE_NAME,
            getRefreshCookieClearOptions(),
        );

        throw error;
    }
}
