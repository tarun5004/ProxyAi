import { describe, expect, it } from "vitest";

import { ApiError } from "./api-error";

describe("ApiError", () => {
    it("reads the approved safe backend error envelope", async () => {
        const error = await ApiError.fromResponse(new Response(JSON.stringify({
            success: false,
            error: {
                code: "POLICY_BLOCKED",
                message: "Request blocked.",
                requestId: "request-id",
                details: { riskScore: 40 },
            },
        }), {
            status: 403,
            headers: { "content-type": "application/json" },
        }));

        expect(error).toMatchObject({
            status: 403,
            code: "POLICY_BLOCKED",
            requestId: "request-id",
            details: { riskScore: 40 },
        });
    });
});
