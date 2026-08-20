import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/errors/api-error";

import { resolveRefreshFailure, type AuthState } from "./auth-provider";

describe("refresh failure state", () => {
    it("preserves an authenticated session on a temporary failure", () => {
        const currentState: AuthState = {
            status: "authenticated",
            accessToken: "access-token",
            expiresInSeconds: 900,
        };

        expect(resolveRefreshFailure(
            new ApiError({
                status: 503,
                code: "AUTH_TEMPORARILY_UNAVAILABLE",
                message: "Authentication is temporarily unavailable.",
            }),
            currentState,
        )).toBe(currentState);
    });

    it("becomes anonymous only for a terminal unauthorized response", () => {
        expect(resolveRefreshFailure(
            new ApiError({
                status: 401,
                code: "INVALID_REFRESH_TOKEN",
                message: "Session is invalid or expired.",
            }),
        )).toEqual({ status: "anonymous" });
    });
});
