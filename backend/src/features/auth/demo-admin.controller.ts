import type { Request, Response } from "express";
import { z } from "zod";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { createSuccessResponse } from "../../shared/responses/api-response.js";
import { demoAdminService } from "./demo-admin.service.js";
import { publicDemoRateLimiter } from "./login-rate-limit.service.js";
import {
    getRefreshCookieClearOptions,
    REFRESH_COOKIE_NAME,
} from "./refresh-token.service.js";

const demoAdminBodySchema = z.union([
    z.undefined(),
    z.strictObject({}),
]);

interface DemoAdminControllerDependencies {
    readonly enabled: boolean;
    readonly rateLimiter: Pick<typeof publicDemoRateLimiter, "consume">;
    readonly service: Pick<typeof demoAdminService, "start">;
}

export function createDemoAdminHandler(
    dependencies: DemoAdminControllerDependencies = {
        enabled: env.PUBLIC_ADMIN_DEMO_ENABLED,
        rateLimiter: publicDemoRateLimiter,
        service: demoAdminService,
    },
) {
    return async function startDemoAdmin(
        request: Request,
        response: Response,
    ): Promise<void> {
        if (!dependencies.enabled) {
            throw new AppError(404, "NOT_FOUND", "Resource not found.");
        }

        const parsedBody = demoAdminBodySchema.safeParse(request.body);

        if (!parsedBody.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Request validation failed.",
            );
        }

        await dependencies.rateLimiter.consume({
            ipAddress:
                request.ip
                || request.socket.remoteAddress
                || "unknown",
        });

        const result = await dependencies.service.start(
            request.log,
            request.requestId,
        );

        response.clearCookie(
            REFRESH_COOKIE_NAME,
            getRefreshCookieClearOptions(),
        );
        response.setHeader("Cache-Control", "no-store");
        response.status(200).json(
            createSuccessResponse(result, request.requestId),
        );
    };
}

export const demoAdmin = createDemoAdminHandler();
