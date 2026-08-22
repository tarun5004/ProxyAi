import { afterEach, describe, expect, it, vi } from "vitest";

const apiClient = vi.hoisted(() => ({ requestJson: vi.fn() }));

vi.mock("./api-client", () => apiClient);

import {
    downloadAdminAudit,
    getAdminBilling,
    getAdminSummary,
    listAdminAlerts,
    listAdminAudit,
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
        listConversations("access-token", { cursor: "opaque+/=" });
        getConversation("access-token", "id/with/slash");
        updateConversationTitle("access-token", "id/with/slash", "Renamed");
        listConversationMessages("access-token", "id/with/slash", { cursor: "message+/=" });

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
            path: "/conversations?limit=25&cursor=opaque%2B%2F%3D",
        }));
        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/conversations/id%2Fwith%2Fslash/messages?limit=50&cursor=message%2B%2F%3D",
        }));
    });

    it("uses allowlisted admin mutation shapes and a credentialed audit export", async () => {
        apiClient.requestJson.mockResolvedValue({ success: true, data: {}, meta: { requestId: "request-id" } });
        const fetchMock = vi.fn().mockResolvedValue(new Response("audit", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        getAdminSummary("access-token");
        getAdminBilling("access-token");
        listAdminLogs("access-token", { cursor: "logs+/=" });
        listAdminAlerts("access-token", { cursor: "alerts+/=" });
        listAdminAudit("access-token", {
            cursor: "audit+/=",
            dateFrom: "2026-08-01T00:00:00.000Z",
            dateTo: "2026-08-21T00:00:00.000Z",
            actorId: "11111111-1111-4111-8111-111111111111",
            action: "policy.block",
        });
        listAdminUsers("access-token", { cursor: "users+/=" });
        listAdminTeams("access-token", { cursor: "teams+/=" });
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
        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/admin/logs?limit=25&cursor=logs%2B%2F%3D",
        }));
        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/admin/alerts?limit=25&cursor=alerts%2B%2F%3D",
        }));
        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/admin/audit?limit=25&dateFrom=2026-08-01T00%3A00%3A00.000Z&dateTo=2026-08-21T00%3A00%3A00.000Z&cursor=audit%2B%2F%3D&actorId=11111111-1111-4111-8111-111111111111&action=policy.block",
        }));
        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/admin/users?limit=25&cursor=users%2B%2F%3D",
        }));
        expect(apiClient.requestJson).toHaveBeenCalledWith(expect.objectContaining({
            path: "/admin/teams?limit=25&cursor=teams%2B%2F%3D",
        }));
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/admin/audit/export?dateFrom=2026-08-01&dateTo=2026-08-21",
            expect.objectContaining({ credentials: "include", cache: "no-store" }),
        );
        expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer access-token");
    });
});
