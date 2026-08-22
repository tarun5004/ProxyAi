import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/errors/api-error";

import {
    bootstrapSession,
    resolveRefreshFailure,
    type AuthState,
} from "./auth-provider";
import type { CurrentSession } from "./auth.types";

const currentSession: CurrentSession = {
    userId: "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
    role: "EMPLOYEE",
    permissions: ["chat:send", "chat:view_own"],
    sessionId: "33333333-3333-4333-8333-333333333333",
    user: {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "employee@example.com",
        displayName: "Example Employee",
        role: "EMPLOYEE",
        permissions: ["chat:send", "chat:view_own"],
        organisation: {
            orgId: "22222222-2222-4222-8222-222222222222",
            name: "Example Organisation",
            plan: "FREE",
            retentionMode: "METADATA_ONLY",
        },
    },
};

describe("session bootstrap", () => {
    it("restores the safe user and organisation profile after refresh", async () => {
        await expect(bootstrapSession(undefined, {
            refreshRequest: async () => ({
                success: true,
                data: {
                    accessToken: "access-token",
                    expiresInSeconds: 900,
                },
                meta: { requestId: "refresh-request" },
            }),
            meRequest: async () => ({
                success: true,
                data: currentSession,
                meta: { requestId: "me-request" },
            }),
        })).resolves.toMatchObject({
            status: "authenticated",
            context: {
                userId: currentSession.userId,
                orgId: currentSession.orgId,
                role: currentSession.role,
                permissions: currentSession.permissions,
                sessionId: currentSession.sessionId,
            },
            user: currentSession.user,
        });
    });

    it("treats an explicit no-cookie response as clean anonymous bootstrap", async () => {
        let meCalled = false;

        await expect(bootstrapSession(undefined, {
            refreshRequest: async () => undefined,
            meRequest: async () => {
                meCalled = true;
                throw new Error("must not run");
            },
        })).resolves.toEqual({ status: "anonymous" });
        expect(meCalled).toBe(false);
    });
});

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
