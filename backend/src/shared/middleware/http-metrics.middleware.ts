import type { NextFunction, Request, Response } from "express";

import {
    APPROVED_HTTP_ROUTES,
    metrics,
    normalizeHttpMethod,
    normalizeHttpRoute,
    toHttpStatusClass,
    type ApprovedHttpRoute,
} from "../observability/metrics.js";

const approvedRoutePatterns = APPROVED_HTTP_ROUTES
    .filter((route) => route !== "unmatched")
    .map((route) => ({
        route,
        pattern: new RegExp(
            `^${route
                .split("/")
                .map((segment) => segment.startsWith(":")
                    ? "[^/]+"
                    : escapeRegExp(segment))
                .join("/")}/?$`,
        ),
    }));

export function httpMetricsMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
): void {
    if (request.path === "/metrics") {
        next();
        return;
    }

    const startedAt = process.hrtime.bigint();
    let observed = false;

    const observeRequest = () => {
        if (observed) {
            return;
        }

        observed = true;
        const labels = {
            method: normalizeHttpMethod(request.method),
            route: resolveHttpRouteTemplate(request),
            status_class: toHttpStatusClass(response.statusCode),
        };
        const durationSeconds = Number(process.hrtime.bigint() - startedAt)
            / 1_000_000_000;

        metrics.httpRequestsTotal.inc(labels);
        metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
    };

    response.once("finish", observeRequest);
    response.once("close", observeRequest);
    next();
}

export function resolveHttpRouteTemplate(
    request: Pick<Request, "baseUrl" | "originalUrl" | "route">,
): ApprovedHttpRoute {
    const routePath: unknown = request.route?.path;

    if (typeof routePath !== "string") {
        return "unmatched";
    }

    const template = routePath === "/"
        ? request.baseUrl
        : `${request.baseUrl}${routePath}`;

    const normalizedTemplate = normalizeHttpRoute(template);

    if (normalizedTemplate !== "unmatched") {
        return normalizedTemplate;
    }

    const requestPath = request.originalUrl.split("?", 1)[0] ?? "";

    return approvedRoutePatterns.find(({ pattern }) => pattern.test(requestPath))
        ?.route ?? "unmatched";
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
