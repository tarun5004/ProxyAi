import { describe, expect, it } from "vitest";

import {
    createNextConfig,
    VERCEL_BACKEND_ORIGIN,
} from "./next.config";

describe("frontend deployment output", () => {
    it("uses transparent Vercel rewrites to the Render backend", async () => {
        const config = createNextConfig({
            NODE_ENV: "production",
            VERCEL: "1",
        });

        expect(config.output).toBeUndefined();
        expect(config.redirects).toBeUndefined();
        await expect(config.rewrites?.()).resolves.toEqual([
            {
                source: "/api/:path*",
                destination: `${VERCEL_BACKEND_ORIGIN}/api/:path*`,
            },
            {
                source: "/health/:path*",
                destination: `${VERCEL_BACKEND_ORIGIN}/health/:path*`,
            },
        ]);
    });

    it("preserves standalone output and configured proxying for Docker builds", async () => {
        const config = createNextConfig({
            BACKEND_INTERNAL_ORIGIN: "http://api:8080",
            NODE_ENV: "production",
        });

        expect(config.output).toBe("standalone");
        await expect(config.rewrites?.()).resolves.toEqual([
            {
                source: "/api/:path*",
                destination: "http://api:8080/api/:path*",
            },
            {
                source: "/health/:path*",
                destination: "http://api:8080/health/:path*",
            },
        ]);
    });

    it("keeps local development traffic on the localhost backend", async () => {
        const config = createNextConfig({
            NODE_ENV: "development",
        });

        await expect(config.rewrites?.()).resolves.toEqual([
            {
                source: "/api/:path*",
                destination: "http://localhost:8080/api/:path*",
            },
            {
                source: "/health/:path*",
                destination: "http://localhost:8080/health/:path*",
            },
        ]);
    });
});
