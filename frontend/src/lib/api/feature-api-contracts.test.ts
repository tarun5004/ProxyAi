import { afterEach, describe, expect, it, vi } from "vitest";

const apiClient = vi.hoisted(() => ({ requestJson: vi.fn() }));

vi.mock("./api-client", () => apiClient);

import {
    downloadAdminAudit,
    getAdminBilling,
    getAdminSummary,
    listAdminAlerts,
    listAdminLogs,
    listAdminTeams,
    listAdminUsers,
    revokeAdminUserSessions,
    updateAdminAlert,
    updateAdminPolicy,
    updateAdminRetention,
    updateAdminUserRole,
    updateAdminUserStatus,
    updateAdminUserTeam,
} from "@/features/admin/admin.api";
import { loginRequest, logoutRequest, meRequest, refreshRequest } from "@/features/auth/auth.api";
import {
    createConversation,
    getConversation,
    listConversationMessages,
    listConversations,
    updateConversationTitle,
} from "@/features/conversations/conversation.api";

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe("frontend feature API contracts", () => {
    it("keeps auth and conversation requests on canonical scoped paths", async () => {
        apiClient.requestJson.mockResolvedValue({ success: true, data: {}, meta: { requestId: "request-id" } });

        await loginRequest({ organisationSlug: " ProxiAI-Demo ", email: " Admin@ProxiAI.Local ", password: "  preserved password  " });
        refreshRequest();
        meRequest("access-token");
        logoutRequest();
        createConversation("access-token");
        createConversation("access-token", "Security review");
        listConversations("access-token");
        getConversation("access-token", "id/with/slash");
        updateConversationTitle("access-token", "id/with/slash", "Renamed");
        listConversationMessages("access-token", "id/with/slash");

        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/auth/login",
            method: "POST",
            body: {
                organisationSlug: "ProxiAI-Demo",
                email: "Admin@ProxiAI.Local",
                password: "  preserved password  ",
            },
        }));
        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/conversations/id%2Fwith%2Fslash",
            method: "PATCH",
            body: { title: "Renamed" },
        }));
        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/conversations/id%2Fwith%2Fslash/messages?limit=100",
        }));
    });

    it("uses allowlisted admin mutation shapes and a credentialed audit export", async () => {
        apiClient.requestJson.mockResolvedValue({ success: true, data: {}, meta: { requestId: "request-id" } });
        const fetchMock = vi.fn().mockResolvedValue(new Response("audit", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        getAdminSummary("access-token");
        getAdminBilling("access-token");
        listAdminLogs("access-token");
        listAdminAlerts("access-token");
        listAdminUsers("access-token");
        listAdminTeams("access-token");
        updateAdminUserRole("access-token", "user-id", "TEAM_LEAD");
        updateAdminUserTeam("access-token", "user-id", null);
        updateAdminUserStatus("access-token", "user-id", "DISABLED");
        revokeAdminUserSessions("access-token", "user-id");
        updateAdminPolicy("access-token", { maskThreshold: 20, blockThreshold: 60, monthlyTokenBudget: 1000 });
        updateAdminRetention("access-token", "ENCRYPTED_STORAGE");
        updateAdminAlert("access-token", "alert-id", true);
        await downloadAdminAudit("access-token", "2026-08-01", "2026-08-21");

        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/admin/users/user-id/role",
            body: { role: "TEAM_LEAD" },
        }));
        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/admin/retention",
            body: { mode: "ENCRYPTED_STORAGE" },
        }));
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/admin/audit/export?dateFrom=2026-08-01&dateTo=2026-08-21",
            expect.objectContaining({ credentials: "include", cache: "no-store" }),
        );
        expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer access-token");
    });
});
