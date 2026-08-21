import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboard } from "./admin-dashboard";

const adminApi = vi.hoisted(() => ({
    downloadAdminAudit: vi.fn(),
    getAdminBilling: vi.fn(),
    getAdminSummary: vi.fn(),
    listAdminAlerts: vi.fn(),
    listAdminLogs: vi.fn(),
    listAdminTeams: vi.fn(),
    listAdminUsers: vi.fn(),
    revokeAdminUserSessions: vi.fn(),
    updateAdminAlert: vi.fn(),
    updateAdminPolicy: vi.fn(),
    updateAdminRetention: vi.fn(),
    updateAdminUserRole: vi.fn(),
    updateAdminUserStatus: vi.fn(),
    updateAdminUserTeam: vi.fn(),
}));
const authState = vi.hoisted(() => ({
    permissions: [
        "admin:view_logs",
        "admin:view_billing",
        "admin:manage_users",
    ],
}));

vi.mock("./admin.api", () => adminApi);
vi.mock("@/features/auth/auth-provider", () => ({
    useAuth: () => ({
        status: "authenticated",
        accessToken: "access-token",
        context: { permissions: authState.permissions },
        logout: vi.fn(),
    }),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn() }),
}));

function envelope(data: unknown) {
    return { success: true, data, meta: { requestId: "request-id" } };
}

describe("Phase 8 admin dashboard", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        authState.permissions = [
            "admin:view_logs",
            "admin:view_billing",
            "admin:manage_users",
        ];
        adminApi.getAdminSummary.mockResolvedValue(envelope({
            period: "month",
            range: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-21T00:00:00.000Z" },
            organisation: {
                name: "ProxyAI Demo",
                plan: "FREE",
                retentionMode: "METADATA_ONLY",
                policy: { maskThreshold: 20, blockThreshold: 60 },
            },
            requests: { total: 5, completed: 3, blocked: 1, masked: 1, failed: 0, interrupted: 1 },
            usage: { knownRequestCount: 3, unknownRequestCount: 1, inputTokens: 20, outputTokens: 30, totalTokens: 50 },
            providerModels: [{ providerId: "groq", model: "openai/gpt-oss-20b", requestCount: 4 }],
            budget: { monthlyBudgetTokens: 1000, usedTokens: 50, remainingTokens: 950, remainingPercent: 95, exceeded: false },
            alerts: { open: 1 },
            providerHealth: [{ providerId: "groq", state: "HEALTHY" }],
        }));
        adminApi.getAdminBilling.mockResolvedValue(envelope({
            period: "2026-08",
            budget: { tokenLimit: 1000, knownTokensUsed: 50, remainingKnownTokens: 950, exceededByKnownUsage: false, accountingComplete: false },
            totals: { requestCount: 4, knownUsageRequestCount: 3, unknownUsageRequestCount: 1, inputTokens: 20, outputTokens: 30, totalTokens: 50 },
            providerModels: [],
            unresolvedUsage: [],
        }));
        adminApi.listAdminLogs.mockResolvedValue(envelope({ items: [] }));
        adminApi.listAdminAlerts.mockResolvedValue(envelope({ items: [] }));
        adminApi.listAdminUsers.mockResolvedValue(envelope({ items: [] }));
        adminApi.listAdminTeams.mockResolvedValue(envelope({ items: [] }));
    });

    it("shows loading then authoritative overview values", async () => {
        render(<AdminDashboard />);

        expect(screen.getByText("Loading organisation data")).toBeInTheDocument();
        expect(await screen.findByText("ProxyAI Demo")).toBeInTheDocument();
        expect(screen.getByText("Unknown usage")).toBeInTheDocument();
        expect(screen.queryByText(/estimated cost/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/cache hit/i)).not.toBeInTheDocument();
    });

    it("denies users without admin permissions without fetching data", async () => {
        authState.permissions = ["chat:send"];
        render(<AdminDashboard />);

        expect(screen.getByText("Access denied")).toBeInTheDocument();
        await waitFor(() => expect(adminApi.getAdminSummary).not.toHaveBeenCalled());
    });

    it("shows a safe error state when admin reads fail", async () => {
        adminApi.getAdminSummary.mockRejectedValueOnce(new Error("unavailable"));
        render(<AdminDashboard />);

        expect(await screen.findByText("Admin data unavailable")).toBeInTheDocument();
        expect(screen.getByText("No cached or fabricated values are shown.")).toBeInTheDocument();
    });

    it("waits for audited policy mutation confirmation before showing refreshed data", async () => {
        authState.permissions = ["admin:view_logs", "admin:configure_policy"];
        let completeMutation!: () => void;
        adminApi.updateAdminPolicy.mockReturnValueOnce(new Promise<void>((resolve) => {
            completeMutation = resolve;
        }));
        render(<AdminDashboard />);

        const save = await screen.findByRole("button", { name: "Save policy" });
        fireEvent.click(save);
        expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();

        completeMutation();
        await waitFor(() => expect(adminApi.updateAdminPolicy).toHaveBeenCalledWith(
            "access-token",
            { maskThreshold: 20, blockThreshold: 60, monthlyTokenBudget: 1000 },
        ));
        await waitFor(() => expect(screen.getByRole("button", { name: "Save policy" })).toBeEnabled());
    });

    it("surfaces user mutation failure and keeps role, team, and status controls scoped", async () => {
        const user = {
            userId: "11111111-1111-4111-8111-111111111111",
            email: "member@proxiai.local",
            displayName: "Demo Member",
            role: "EMPLOYEE",
            permissions: ["chat:send"],
            status: "ACTIVE",
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
        };
        const team = {
            teamId: "22222222-2222-4222-8222-222222222222",
            name: "Security",
            isActive: true,
            createdBy: "33333333-3333-4333-8333-333333333333",
            memberCount: 1,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
        };
        adminApi.listAdminUsers.mockResolvedValueOnce(envelope({ items: [user] }));
        adminApi.listAdminTeams.mockResolvedValueOnce(envelope({ items: [team] }));
        adminApi.updateAdminUserRole.mockRejectedValueOnce(new Error("safe failure"));
        adminApi.updateAdminUserTeam.mockResolvedValueOnce(envelope({}));
        adminApi.updateAdminUserStatus.mockResolvedValueOnce(envelope({}));
        vi.spyOn(window, "confirm").mockReturnValue(true);
        render(<AdminDashboard />);

        fireEvent.click(await screen.findByRole("button", { name: "users" }));
        fireEvent.change(await screen.findByRole("combobox", { name: "Role for Demo Member" }), {
            target: { value: "TEAM_LEAD" },
        });
        expect(await screen.findByRole("alert")).toHaveTextContent("Update failed");

        fireEvent.change(screen.getByRole("combobox", { name: "Team for Demo Member" }), {
            target: { value: team.teamId },
        });
        await waitFor(() => expect(adminApi.updateAdminUserTeam).toHaveBeenCalledWith(
            "access-token",
            user.userId,
            team.teamId,
        ));

        fireEvent.click(screen.getByRole("button", { name: "Disable" }));
        await waitFor(() => expect(adminApi.updateAdminUserStatus).toHaveBeenCalledWith(
            "access-token",
            user.userId,
            "DISABLED",
        ));
    });

    it("requires confirmation for retention and exposes audit export only with permission", async () => {
        authState.permissions = [
            "admin:view_logs",
            "admin:view_billing",
            "admin:configure_policy",
            "admin:export_audit",
        ];
        vi.spyOn(window, "confirm").mockReturnValue(true);
        adminApi.updateAdminRetention.mockResolvedValueOnce(envelope({}));
        adminApi.downloadAdminAudit.mockResolvedValueOnce(new Blob(["audit"]));
        class TestURL extends URL {
            public static createObjectURL = vi.fn(() => "blob:audit");
            public static revokeObjectURL = vi.fn();
        }
        vi.stubGlobal("URL", TestURL);
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        render(<AdminDashboard />);

        fireEvent.click(await screen.findByRole("button", { name: "Use encrypted storage" }));
        await waitFor(() => expect(adminApi.updateAdminRetention).toHaveBeenCalledWith(
            "access-token",
            "ENCRYPTED_STORAGE",
        ));

        fireEvent.click(screen.getByRole("button", { name: "logs" }));
        fireEvent.click(await screen.findByRole("button", { name: "Export audit CSV" }));
        await waitFor(() => expect(adminApi.downloadAdminAudit).toHaveBeenCalledTimes(1));
        expect(clickSpy).toHaveBeenCalledTimes(1);
    });
});
