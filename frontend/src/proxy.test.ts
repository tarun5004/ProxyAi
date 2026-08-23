import {
    getRewrittenUrl,
    isRewrite,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config, proxy, VERCEL_BACKEND_ORIGIN } from "./proxy";

describe("Vercel backend proxy", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("rewrites same-origin API requests without forwarding the browser origin", () => {
        vi.stubEnv("VERCEL", "1");
        const request = new NextRequest(
            "https://preview.example.vercel.app/api/v1/auth/demo-admin",
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    origin: "https://preview.example.vercel.app",
                },
            },
        );

        const response = proxy(request);

        expect(isRewrite(response)).toBe(true);
        expect(getRewrittenUrl(response)).toBe(
            `${VERCEL_BACKEND_ORIGIN}/api/v1/auth/demo-admin`,
        );
        expect(response.headers.get("x-middleware-request-origin")).toBeNull();
    });

    it("rewrites health checks and preserves their query string", () => {
        vi.stubEnv("VERCEL", "1");
        const request = new NextRequest(
            "https://preview.example.vercel.app/health/ready?probe=demo",
        );

        const response = proxy(request);

        expect(getRewrittenUrl(response)).toBe(
            `${VERCEL_BACKEND_ORIGIN}/health/ready?probe=demo`,
        );
    });

    it("rejects cross-origin requests before they reach the backend", async () => {
        vi.stubEnv("VERCEL", "1");
        const request = new NextRequest(
            "https://preview.example.vercel.app/api/v1/auth/demo-admin",
            {
                method: "POST",
                headers: {
                    origin: "https://malicious.example",
                },
            },
        );

        const response = proxy(request);

        expect(isRewrite(response)).toBe(false);
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            error: { code: "ORIGIN_DENIED" },
        });
    });

    it("matches only API and health paths", () => {
        expect(config.matcher).toEqual([
            "/api/:path*",
            "/health/:path*",
        ]);
    });
});
