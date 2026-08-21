import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authApi = vi.hoisted(() => ({
    loginRequest: vi.fn(),
    logoutRequest: vi.fn(),
    meRequest: vi.fn(),
    refreshRequest: vi.fn(),
}));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("./auth.api", () => authApi);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AuthProvider, useAuth } from "./auth-provider";
import { LoginScreen } from "./login-screen";
import { ProtectedWorkspace } from "./protected-workspace";

const context = {
    userId: "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
    role: "ORG_ADMIN" as const,
    permissions: ["chat:send", "admin:view_logs"] as const,
    sessionId: "33333333-3333-4333-8333-333333333333",
};

function SessionProbe() {
    const auth = useAuth();

    return (
        <div>
            <output>{auth.status}</output>
            <button type="button" onClick={() => void auth.login({
                organisationSlug: "proxiai-demo",
                email: "admin@proxiai.local",
                password: "correct horse battery staple",
            })}>Login probe</button>
            <button type="button" onClick={() => void auth.logout()}>Logout probe</button>
        </div>
    );
}

describe("frontend authentication release gate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authApi.refreshRequest.mockResolvedValue({
            data: { accessToken: "refreshed-token", expiresInSeconds: 300 },
        });
        authApi.meRequest.mockResolvedValue({ data: context });
        authApi.loginRequest.mockResolvedValue({
            data: {
                accessToken: "login-token",
                expiresInSeconds: 300,
                user: {
                    userId: context.userId,
                    displayName: "Demo Admin",
                    role: "ORG_ADMIN",
                    organisation: { orgId: context.orgId, name: "ProxiAI Demo", slug: "proxiai-demo" },
                },
            },
        });
        authApi.logoutRequest.mockResolvedValue({ data: { loggedOut: true } });
    });

    it("bootstraps, logs out, and logs back in through authoritative APIs", async () => {
        render(<AuthProvider><SessionProbe /></AuthProvider>);

        expect(await screen.findByText("authenticated")).toBeInTheDocument();
        expect(authApi.refreshRequest).toHaveBeenCalledTimes(1);
        expect(authApi.meRequest).toHaveBeenCalledWith("refreshed-token");

        fireEvent.click(screen.getByRole("button", { name: "Logout probe" }));
        expect(await screen.findByText("anonymous")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Login probe" }));
        expect(await screen.findByText("authenticated")).toBeInTheDocument();
        expect(authApi.loginRequest).toHaveBeenCalledWith(expect.objectContaining({
            organisationSlug: "proxiai-demo",
            email: "admin@proxiai.local",
        }));
        expect(authApi.meRequest).toHaveBeenLastCalledWith("login-token");
    });

    it("submits login safely and preserves a generic public failure", async () => {
        const login = vi.fn().mockResolvedValue(undefined);
        vi.spyOn(await import("./auth-provider"), "useAuth").mockReturnValue({
            status: "anonymous",
            login,
            logout: vi.fn(),
            retrySession: vi.fn(),
        });

        render(<LoginScreen />);
        fireEvent.change(screen.getByLabelText("Organisation slug"), { target: { value: "proxiai-demo" } });
        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@proxiai.local" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "  preserved password  " } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(login).toHaveBeenCalledWith({
            organisationSlug: "proxiai-demo",
            email: "admin@proxiai.local",
            password: "  preserved password  ",
        }));
        expect(router.replace).toHaveBeenCalledWith("/chat");

        login.mockRejectedValueOnce(new Error("sensitive upstream detail"));
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "We couldn't sign you in. Check your details and try again.",
        );
        expect(screen.queryByText(/sensitive upstream detail/i)).not.toBeInTheDocument();
    });

    it("keeps unavailable and anonymous workspaces behind the protected boundary", async () => {
        const retrySession = vi.fn();
        const useAuthSpy = vi.spyOn(await import("./auth-provider"), "useAuth");
        useAuthSpy.mockReturnValue({
            status: "unavailable",
            login: vi.fn(),
            logout: vi.fn(),
            retrySession,
        });

        const { rerender } = render(<ProtectedWorkspace>Private workspace</ProtectedWorkspace>);
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retrySession).toHaveBeenCalledTimes(1);

        useAuthSpy.mockReturnValue({
            status: "anonymous",
            login: vi.fn(),
            logout: vi.fn(),
            retrySession: vi.fn(),
        });
        rerender(<ProtectedWorkspace>Private workspace</ProtectedWorkspace>);
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
        expect(screen.queryByText("Private workspace")).not.toBeInTheDocument();
    });
});
