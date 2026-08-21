import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { requestJson } from "./api-client";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("browser API client", () => {
    it("sends credentialed JSON with the access token and validates the response", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: "safe" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(requestJson({
            path: "/example",
            method: "POST",
            accessToken: "access-token",
            body: { enabled: true },
            schema: z.object({ value: z.literal("safe") }),
        })).resolves.toEqual({ value: "safe" });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/v1/example");
        expect(init.credentials).toBe("include");
        expect(init.cache).toBe("no-store");
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
        expect(init.body).toBe(JSON.stringify({ enabled: true }));
    });

    it("preserves the backend safe error envelope instead of fabricating success", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied.", requestId: "request-id" },
        }), { status: 403, headers: { "content-type": "application/json" } })));

        await expect(requestJson({
            path: "/admin/summary",
            schema: z.object({ success: z.literal(true) }),
        })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN", requestId: "request-id" });
    });
});
