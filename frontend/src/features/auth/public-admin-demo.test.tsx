import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authApi = vi.hoisted(() => ({
    loginRequest: vi.fn(),
    logoutRequest: vi.fn(),
    meRequest: vi.fn(),
    refreshRequest: vi.fn(),
    startPublicAdminDemoRequest: vi.fn(),
}));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("./auth.api", () => authApi);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { DemoAccessSection } from "@/features/marketing/components/demo-access-section";

import { AuthProvider, useAuth } from "./auth-provider";
import { PublicAdminDemoBanner } from "./public-admin-demo-banner";
import {
    createDemoHealthUrl,
    DEMO_HEALTH_POLL_INTERVAL_MS,
    PublicAdminDemoScreen,
    waitForDemoBackend,
} from "./public-admin-demo-screen";

const expiresAt = "2026-08-22T12:06:00.000Z";
const context = {
    userId: "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
    role: "ORG_ADMIN" as const,
    permissions: [
        "chat:send",
        "chat:view_own",
        "team:view_logs",
        "admin:view_logs",
        "admin:view_billing",
        "admin:manage_users",
        "admin:configure_policy",
        "admin:export_audit",
    ] as const,
    sessionId: "33333333-3333-4333-8333-333333333333",
    sessionMode: "PUBLIC_ADMIN_DEMO" as const,
};

function DemoSessionProbe() {
    const auth = useAuth();

    return (
        <div>
            <output>{auth.status}</output>
            <output>{auth.demoExpiresAt ?? "countdown-not-started"}</output>
            <button
                type="button"
                onClick={() => void auth.startPublicAdminDemo()}
            >
                Start session
            </button>
            {auth.context?.sessionMode === "PUBLIC_ADMIN_DEMO"
            && auth.demoExpiresAt ? (
                <PublicAdminDemoBanner
                    expiresAt={auth.demoExpiresAt}
                    onExpire={auth.expirePublicDemo}
                />
                ) : null}
        </div>
    );
}

describe("public admin demo", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authApi.refreshRequest.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("derives wake health checks from the configured backend API origin", async () => {
        expect(createDemoHealthUrl(
            "https://proxiai-api.onrender.com/api/v1",
        )).toBe("https://proxiai-api.onrender.com/health/ready");
        expect(createDemoHealthUrl(
            "http://localhost:8080/api/v1",
        )).toBe("http://localhost:8080/health/ready");
        expect(createDemoHealthUrl(undefined)).toBe("/health/ready");

        vi.stubEnv(
            "NEXT_PUBLIC_API_BASE_URL",
            "https://proxiai-api.onrender.com/api/v1",
        );
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
            status: 200,
        }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(waitForDemoBackend({
            signal: new AbortController().signal,
        })).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://proxiai-api.onrender.com/health/ready",
            expect.objectContaining({ cache: "no-store" }),
        );
    });

    it("polls a cold backend at the bounded four-second interval", async () => {
        const healthResults = [false, false, true];
        const sleeps: number[] = [];
        let now = 0;

        await expect(waitForDemoBackend({
            signal: new AbortController().signal,
            checkHealth: async () => healthResults.shift() ?? false,
            sleep: async (durationMs) => {
                sleeps.push(durationMs);
                now += durationMs;
            },
            now: () => now,
        })).resolves.toBe(true);

        expect(sleeps).toEqual([
            DEMO_HEALTH_POLL_INTERVAL_MS,
            DEMO_HEALTH_POLL_INTERVAL_MS,
        ]);
    });

    it("starts countdown only after authentication and expires local auth state", async () => {
        vi.useFakeTimers();
        vi.setSystemTime("2026-08-22T12:00:00.000Z");

        let resolveDemo!: (value: unknown) => void;
        authApi.startPublicAdminDemoRequest.mockReturnValue(
            new Promise((resolve) => {
                resolveDemo = resolve;
            }),
        );
        authApi.meRequest.mockResolvedValue({
            data: {
                ...context,
                user: {
                    userId: context.userId,
                    email: "admin-demo@novastack.demo",
                    displayName: "NovaStack Admin Demo",
                    role: "ORG_ADMIN",
                    permissions: [...context.permissions],
                    organisation: {
                        orgId: context.orgId,
                        name: "NovaStack Technologies",
                        plan: "FREE",
                        retentionMode: "METADATA_ONLY",
                    },
                },
            },
        });

        render(<AuthProvider><DemoSessionProbe /></AuthProvider>);
        await act(async () => Promise.resolve());
        fireEvent.click(screen.getByRole("button", { name: "Start session" }));
        expect(screen.getByText("countdown-not-started")).toBeInTheDocument();

        await act(async () => {
            resolveDemo({
                data: {
                    accessToken: "public-demo-token",
                    expiresAt,
                    expiresInSeconds: 360,
                },
            });
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByText(expiresAt)).toBeInTheDocument();
        expect(screen.getByText(/Session expires in 06:00/)).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(360_000);
        });
        expect(screen.getByText("anonymous")).toBeInTheDocument();
    });

    it("offers passwordless demo entry without embedding a password control", async () => {
        const useAuthSpy = vi.spyOn(
            await import("./auth-provider"),
            "useAuth",
        ).mockReturnValue({
            status: "anonymous",
            expirePublicDemo: vi.fn(),
            login: vi.fn(),
            logout: vi.fn(),
            retrySession: vi.fn(),
            startPublicAdminDemo: vi.fn(),
        });

        const { rerender } = render(<DemoAccessSection />);
        expect(screen.getByRole("link", { name: "Open Admin Demo" }))
            .toHaveAttribute("href", "/demo-admin");
        expect(screen.getByText(/may take 1–2 minutes to wake/i))
            .toBeInTheDocument();

        rerender(<PublicAdminDemoScreen />);
        expect(screen.getByRole("button", { name: /Open Admin Demo/i }))
            .toBeInTheDocument();
        expect(screen.queryByRole("textbox", { name: /password/i }))
            .not.toBeInTheDocument();
        expect(document.body.textContent).not.toContain(
            "PUBLIC_ADMIN_PASSWORD_SENTINEL",
        );
        useAuthSpy.mockRestore();
    });
});
