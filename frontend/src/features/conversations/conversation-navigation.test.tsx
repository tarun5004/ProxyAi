import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationSidebar } from "./conversation-sidebar";
import { ConversationTitleEditor } from "./conversation-title-editor";

afterEach(cleanup);

describe("conversation navigation discovery", () => {
    it("makes manual rename visible and supports keyboard cancellation", async () => {
        const onRename = vi.fn(async () => undefined);
        render(
            <ConversationTitleEditor
                title="New conversation"
                onRename={onRename}
            />,
        );

        expect(screen.getByRole("button", { name: "Rename conversation" })).toHaveTextContent("Rename");
        expect(screen.getByText("Rename this conversation to make it easier to find.")).toBeVisible();

        fireEvent.click(screen.getByRole("button", { name: "Rename conversation" }));
        const input = screen.getByRole("textbox", { name: "Conversation title" });
        fireEvent.change(input, { target: { value: "Cancelled title" } });
        fireEvent.keyDown(input, { key: "Escape" });
        expect(screen.queryByRole("textbox", { name: "Conversation title" })).not.toBeInTheDocument();
        expect(onRename).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Rename conversation" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Conversation title" }), {
            target: { value: "  Incident review  " },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save conversation title" }));

        await waitFor(() => expect(onRename).toHaveBeenCalledWith("Incident review"));
    });

    it("distinguishes duplicate default titles with authoritative last activity", () => {
        render(
            <ConversationSidebar
                conversations={[{
                    conversationId: "11111111-1111-4111-8111-111111111111",
                    title: "New conversation",
                    messageCount: 2,
                    createdAt: "2026-08-19T08:00:00.000Z",
                    lastMessageAt: "2026-08-19T08:05:00.000Z",
                }, {
                    conversationId: "22222222-2222-4222-8222-222222222222",
                    title: "New conversation",
                    messageCount: 1,
                    createdAt: "2026-08-20T09:00:00.000Z",
                    lastMessageAt: "2026-08-20T09:05:00.000Z",
                }]}
                status="ready"
                roleLabel="EMPLOYEE"
                open
                creating={false}
                hasMore={false}
                pageStatus="idle"
                onClose={vi.fn()}
                onCreate={vi.fn()}
                onLoadMore={vi.fn()}
                onLogout={vi.fn()}
                onRetry={vi.fn()}
                showAdmin={false}
            />,
        );

        expect(screen.getAllByText("New conversation")).toHaveLength(2);
        const activityTimes = screen.getAllByLabelText(/Last activity/u);
        expect(activityTimes).toHaveLength(2);
        expect(activityTimes[0]).toHaveAttribute("datetime", "2026-08-19T08:05:00.000Z");
        expect(activityTimes[1]).toHaveAttribute("datetime", "2026-08-20T09:05:00.000Z");
    });

    it("keeps the active conversation when opening organisation admin", () => {
        const conversationId = "11111111-1111-4111-8111-111111111111";

        render(
            <ConversationSidebar
                conversations={[]}
                status="ready"
                activeConversationId={conversationId}
                roleLabel="ORG ADMIN"
                open
                creating={false}
                hasMore={false}
                pageStatus="idle"
                onClose={vi.fn()}
                onCreate={vi.fn()}
                onLoadMore={vi.fn()}
                onLogout={vi.fn()}
                onRetry={vi.fn()}
                showAdmin
            />,
        );

        expect(screen.getByRole("link", { name: "Organisation admin" })).toHaveAttribute(
            "href",
            `/admin?conversationId=${conversationId}`,
        );
    });
});
