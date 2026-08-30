import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/errors/api-error";

import { AdminDashboard } from "./admin-dashboard";

const adminApi = vi.hoisted(() => ({
    downloadAdminAudit: vi.fn(),
    getAdminBilling: vi.fn(),
    getAdminSummary: vi.fn(),
    listAdminAlerts: vi.fn(),
    listAdminAudit: vi.fn(),
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
    retrySession: vi.fn(),
}));

vi.mock("./admin.api", () => adminApi);
vi.mock("@/features/auth/auth-provider", () => ({
    useAuth: () => ({
        status: "authenticated",
        accessToken: "access-token",
        context: { permissions: authState.permissions },
        logout: vi.fn(),
        retrySession: authState.retrySession,
    }),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn() }),
}));

function envelope(data: unknown, nextCursor: string | null = null) {
    return { success: true, data, meta: { requestId: "request-id", nextCursor } };
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
        authState.retrySession.mockResolvedValue(undefined);
        adminApi.getAdminSummary.mockResolvedValue(envelope({
            period: "month",
            range: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-21T00:00:00.000Z" },
            organisation: {
                name: "ProxyAI Demo",
                plan: "FREE",
                retentionMode: "METADATA_ONLY",
                policy: { maskThreshold: 20, blockThreshold: 60, maxOutputTokensPerRequest: 4_096 },
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
        adminApi.listAdminAudit.mockResolvedValue(envelope({ items: [] }));
        adminApi.listAdminAlerts.mockResolvedValue(envelope({ items: [] }));
        adminApi.listAdminUsers.mockResolvedValue(envelope({ items: [] }));
        adminApi.listAdminTeams.mockResolvedValue(envelope({ items: [] }));
    });

    it("shows loading then authoritative overview values", async () => {
        render(<AdminDashboard />);

        expect(screen.getByText("Loading organisation overview")).toBeInTheDocument();
        expect(await screen.findByText("ProxyAI Demo")).toBeInTheDocument();
        expect(screen.getByText("Permission-scoped operations with append-only audit records")).toBeInTheDocument();
        expect(screen.getByText("Unknown usage")).toBeInTheDocument();
        expect(screen.queryByText(/estimated cost/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/cache hit/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/read-only operational view|phase 9 audit guarantees/i)).not.toBeInTheDocument();
    });

    it("denies users without admin permissions without fetching data", async () => {
        authState.permissions = ["chat:send"];
        render(<AdminDashboard />);

        expect(screen.getByText("Access denied")).toBeInTheDocument();
        await waitFor(() => expect(adminApi.getAdminSummary).not.toHaveBeenCalled());
    });

    it("delegates unauthorized section reads to centralized session recovery", async () => {
        adminApi.getAdminSummary.mockRejectedValueOnce(new ApiError({
            status: 401,
            code: "AUTHENTICATION_REQUIRED",
            message: "raw backend message must not render",
        }));

        render(<AdminDashboard />);

        expect(await screen.findByText("Organisation overview unavailable")).toBeInTheDocument();
        await waitFor(() => expect(authState.retrySession).toHaveBeenCalledTimes(1));
        expect(screen.queryByText("raw backend message must not render")).not.toBeInTheDocument();
    });

    it("keeps successful sections usable and retries only the failed section", async () => {
        adminApi.getAdminSummary.mockRejectedValueOnce(new Error("unavailable"));
        render(<AdminDashboard />);

        expect(await screen.findByText("Organisation overview unavailable")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "usage" }));
        expect(await screen.findByText("Usage · 2026-08")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "overview" }));
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        expect(await screen.findByText("ProxyAI Demo")).toBeInTheDocument();
        await waitFor(() => expect(adminApi.getAdminSummary).toHaveBeenCalledTimes(2));
        expect(adminApi.getAdminBilling).toHaveBeenCalledTimes(1);
    });

    it("reviews policy and budget changes, supports cancel, and prevents duplicate submits", async () => {
        authState.permissions = ["admin:view_logs", "admin:configure_policy"];
        let completeMutation!: () => void;
        adminApi.updateAdminPolicy.mockReturnValueOnce(new Promise<void>((resolve) => {
            completeMutation = resolve;
        }));
        render(<AdminDashboard />);

        const save = await screen.findByRole("button", { name: "Save policy" });
        fireEvent.change(screen.getByRole("spinbutton", { name: "Mask threshold" }), { target: { value: "25" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: "Block threshold" }), { target: { value: "70" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: "Monthly token budget" }), { target: { value: "2000" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: "Max response tokens" }), { target: { value: "100" } });
        fireEvent.click(save);

        let dialog = screen.getByRole("dialog", { name: "Confirm policy and budget update" });
        expect(within(dialog).getByText("ProxyAI Demo")).toBeInTheDocument();
        expect(within(dialog).getByText("Mask threshold before")).toBeInTheDocument();
        expect(within(dialog).getByText("20")).toBeInTheDocument();
        expect(within(dialog).getByText("25")).toBeInTheDocument();
        expect(within(dialog).getByText("Monthly token budget after")).toBeInTheDocument();
        expect(within(dialog).getByText("2000")).toBeInTheDocument();
        expect(adminApi.updateAdminPolicy).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(adminApi.updateAdminPolicy).not.toHaveBeenCalled();

        fireEvent.click(save);
        dialog = screen.getByRole("dialog", { name: "Confirm policy and budget update" });
        const confirm = within(dialog).getByRole("button", { name: "Apply policy" });
        fireEvent.click(confirm);
        fireEvent.click(confirm);

        expect(adminApi.updateAdminPolicy).toHaveBeenCalledTimes(1);
        expect(within(dialog).getByRole("button", { name: "Applying…" })).toBeDisabled();

        completeMutation();
        await waitFor(() => expect(adminApi.updateAdminPolicy).toHaveBeenCalledWith(
            "access-token",
            { maskThreshold: 25, blockThreshold: 70, maxOutputTokensPerRequest: 100, monthlyTokenBudget: 2000 },
        ));
        expect(await screen.findByRole("status")).toHaveTextContent("Change saved and verified.");
        expect(adminApi.getAdminSummary).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(screen.getByRole("button", { name: "Save policy" })).toBeEnabled());
    });

    it("retries only authoritative refresh after an accepted mutation", async () => {
        authState.permissions = ["admin:view_logs", "admin:configure_policy"];
        adminApi.updateAdminPolicy.mockResolvedValueOnce(envelope({}));
        render(<AdminDashboard />);

        await screen.findByText("ProxyAI Demo");
        adminApi.getAdminSummary.mockRejectedValueOnce(new Error("refresh unavailable"));

        fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
        fireEvent.click(within(screen.getByRole("dialog", { name: "Confirm policy and budget update" })).getByRole("button", { name: "Apply policy" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Change accepted, but current values could not be verified.");
        expect(adminApi.updateAdminPolicy).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

        expect(await screen.findByRole("status")).toHaveTextContent("Change saved and verified.");
        expect(adminApi.updateAdminPolicy).toHaveBeenCalledTimes(1);
        expect(adminApi.getAdminSummary).toHaveBeenCalledTimes(3);
    });

    it("confirms role, team, status, and session mutations with safe before/after context", async () => {
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
        adminApi.listAdminUsers.mockResolvedValue(envelope({ items: [user] }));
        adminApi.listAdminTeams.mockResolvedValue(envelope({ items: [team] }));
        adminApi.updateAdminUserRole.mockRejectedValueOnce(new ApiError({
            status: 403,
            code: "PERMISSION_DENIED",
            message: "database detail must stay hidden",
        }));
        adminApi.updateAdminUserTeam.mockResolvedValueOnce(envelope({}));
        adminApi.updateAdminUserStatus.mockResolvedValueOnce(envelope({}));
        adminApi.revokeAdminUserSessions.mockResolvedValueOnce(envelope({}));
        render(<AdminDashboard />);

        fireEvent.click(await screen.findByRole("button", { name: "users" }));
        const roleSelect = await screen.findByRole("combobox", { name: "Role for Demo Member" });
        fireEvent.change(roleSelect, {
            target: { value: "ORG_ADMIN" },
        });

        let dialog = screen.getByRole("dialog", { name: "Confirm user role change" });
        expect(within(dialog).getByText("Demo Member (member@proxiai.local)")).toBeInTheDocument();
        expect(within(dialog).getByText("Employee")).toBeInTheDocument();
        expect(within(dialog).getByText("Org admin")).toBeInTheDocument();
        expect(within(dialog).getByText(/grants organisation-administrator privileges/i)).toBeInTheDocument();
        expect(adminApi.updateAdminUserRole).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole("button", { name: "Change role" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Your current permissions do not allow this change.");
        expect(screen.queryByText("database detail must stay hidden")).not.toBeInTheDocument();
        expect(roleSelect).toHaveValue("EMPLOYEE");
        expect(adminApi.updateAdminUserRole).toHaveBeenCalledWith("access-token", user.userId, "ORG_ADMIN");

        fireEvent.change(screen.getByRole("combobox", { name: "Team for Demo Member" }), {
            target: { value: team.teamId },
        });
        dialog = screen.getByRole("dialog", { name: "Confirm team assignment" });
        expect(within(dialog).getByText("No team")).toBeInTheDocument();
        expect(within(dialog).getByText("Security")).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Change team" }));
        await waitFor(() => expect(adminApi.updateAdminUserTeam).toHaveBeenCalledWith(
            "access-token",
            user.userId,
            team.teamId,
        ));

        fireEvent.click(await screen.findByRole("button", { name: "Revoke sessions" }));
        dialog = screen.getByRole("dialog", { name: "Confirm session revocation" });
        expect(within(dialog).getByText(/existing access tokens retain their approved bounded lifetime/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Revoke sessions" }));
        await waitFor(() => expect(adminApi.revokeAdminUserSessions).toHaveBeenCalledWith("access-token", user.userId));

        fireEvent.click(await screen.findByRole("button", { name: "Disable" }));
        dialog = screen.getByRole("dialog", { name: "Confirm user status change" });
        expect(within(dialog).getByText("Active")).toBeInTheDocument();
        expect(within(dialog).getByText("Disabled")).toBeInTheDocument();
        expect(within(dialog).getByText(/prevents authentication and revokes/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Disable user" }));
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
        const dialog = screen.getByRole("dialog", { name: "Confirm retention mode change" });
        expect(within(dialog).getByText("Metadata only")).toBeInTheDocument();
        expect(within(dialog).getByText("Encrypted storage")).toBeInTheDocument();
        expect(within(dialog).getByText(/existing metadata-only history is not backfilled/i)).toBeInTheDocument();
        expect(adminApi.updateAdminRetention).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole("button", { name: "Change retention" }));
        await waitFor(() => expect(adminApi.updateAdminRetention).toHaveBeenCalledWith(
            "access-token",
            "ENCRYPTED_STORAGE",
        ));

        fireEvent.click(screen.getByRole("button", { name: "audit" }));
        fireEvent.click(await screen.findByRole("button", { name: "Export filtered CSV" }));
        await waitFor(() => expect(adminApi.downloadAdminAudit).toHaveBeenCalledTimes(1));
        expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it("browses bounded audit events with actor and event filters", async () => {
        authState.permissions = ["admin:view_logs", "admin:export_audit"];
        const actorId = "11111111-1111-4111-8111-111111111111";
        adminApi.listAdminAudit.mockResolvedValueOnce(envelope({
            items: [{
                auditId: "22222222-2222-4222-8222-222222222222",
                actorId,
                actorType: "USER",
                actorRole: "ORG_ADMIN",
                action: "user.role_changed",
                outcome: "SUCCESS",
                resourceType: "USER",
                resourceId: "33333333-3333-4333-8333-333333333333",
                metadata: { oldRole: "EMPLOYEE", newRole: "ORG_ADMIN" },
                requestId: "44444444-4444-4444-8444-444444444444",
                occurredAt: "2026-08-21T10:00:00.000Z",
            }],
        }));
        adminApi.listAdminAudit.mockResolvedValueOnce(envelope({ items: [] }));
        render(<AdminDashboard />);

        fireEvent.click(await screen.findByRole("button", { name: "audit" }));
        expect(await screen.findByText("user.role_changed")).toBeInTheDocument();
        fireEvent.change(screen.getByRole("textbox", { name: "Actor ID" }), {
            target: { value: actorId },
        });
        fireEvent.change(screen.getByRole("combobox", { name: "Event" }), {
            target: { value: "policy.block" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

        await waitFor(() => expect(adminApi.listAdminAudit).toHaveBeenLastCalledWith(
            "access-token",
            expect.objectContaining({
                actorId,
                action: "policy.block",
            }),
        ));
        expect(screen.queryByText(/raw prompt/i)).not.toBeInTheDocument();
    });

    it("loads admin resources with independent cursors and preserves rows on page failure", async () => {
        const firstUser = {
            userId: "11111111-1111-4111-8111-111111111111",
            email: "first@proxiai.local",
            displayName: "First Member",
            role: "EMPLOYEE",
            permissions: ["chat:send"],
            status: "ACTIVE",
            createdAt: "2026-08-02T00:00:00.000Z",
            updatedAt: "2026-08-02T00:00:00.000Z",
        };
        const secondUser = {
            ...firstUser,
            userId: "22222222-2222-4222-8222-222222222222",
            email: "second@proxiai.local",
            displayName: "Second Member",
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
        };
        const team = {
            teamId: "33333333-3333-4333-8333-333333333333",
            name: "Security",
            isActive: true,
            createdBy: "44444444-4444-4444-8444-444444444444",
            memberCount: 1,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
        };
        adminApi.listAdminUsers
            .mockResolvedValueOnce(envelope({ items: [firstUser] }, "users-cursor"))
            .mockResolvedValueOnce(envelope({ items: [firstUser, secondUser] }));
        adminApi.listAdminTeams
            .mockResolvedValueOnce(envelope({ items: [team] }, "teams-cursor"))
            .mockRejectedValueOnce(new Error("invalid cursor"));

        render(<AdminDashboard />);

        fireEvent.click(await screen.findByRole("button", { name: "users" }));
        fireEvent.click(screen.getByRole("button", { name: "Load more users" }));

        expect(await screen.findByText("Second Member")).toBeInTheDocument();
        expect(screen.getAllByText("First Member")).toHaveLength(1);
        expect(adminApi.listAdminUsers).toHaveBeenLastCalledWith(
            "access-token",
            { cursor: "users-cursor" },
        );
        expect(adminApi.listAdminTeams).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "Load more teams" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "More teams could not be loaded.",
        );
        expect(screen.getByText("1 members · Active")).toBeInTheDocument();
        expect(screen.getByText("Second Member")).toBeInTheDocument();
    });
});
