import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWorkspace } from "./chat-workspace";

const conversationApi = vi.hoisted(() => ({
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    listConversationMessages: vi.fn(),
    listConversations: vi.fn(),
    updateConversationTitle: vi.fn(),
}));
const chatApi = vi.hoisted(() => ({
    streamChat: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
    useAuth: () => ({
        status: "authenticated",
        accessToken: "access-token",
        context: {
            role: "EMPLOYEE",
        },
        logout: vi.fn(),
    }),
}));

vi.mock("@/features/conversations/conversation.api", () => conversationApi);

vi.mock("./chat.api", () => chatApi);

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
    }),
}));

const firstConversation = {
    conversationId: "11111111-1111-4111-8111-111111111111",
    title: "Security review",
    messageCount: 2,
    createdAt: "2026-08-19T08:00:00.000Z",
    lastMessageAt: "2026-08-19T08:05:00.000Z",
};
const secondConversation = {
    conversationId: "22222222-2222-4222-8222-222222222222",
    title: "Provider analysis",
    messageCount: 1,
    createdAt: "2026-08-19T09:00:00.000Z",
    lastMessageAt: "2026-08-19T09:05:00.000Z",
};

function envelope(data: unknown) {
    return {
        success: true,
        data,
        meta: {
            requestId: "request-id",
            nextCursor: null,
        },
    };
}

describe("conversation workspace loading", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        conversationApi.listConversations.mockResolvedValue(
            envelope({ items: [firstConversation, secondConversation] }),
        );
        conversationApi.getConversation.mockImplementation(
            async (_token: string, conversationId: string) => envelope(
                conversationId === firstConversation.conversationId
                    ? firstConversation
                    : secondConversation,
            ),
        );
        conversationApi.listConversationMessages.mockResolvedValue(
            envelope({
                items: [{
                    messageId: "33333333-3333-4333-8333-333333333333",
                    role: "assistant",
                    tokenCount: 24,
                    createdAt: "2026-08-19T08:05:00.000Z",
                    contentAvailable: false,
                }, {
                    messageId: "44444444-4444-4444-8444-444444444444",
                    role: "assistant",
                    createdAt: "2026-08-19T08:06:00.000Z",
                    contentAvailable: true,
                    content: "## Stored answer",
                }],
            }),
        );
        chatApi.streamChat.mockImplementation(async function* ({ signal }) {
            await new Promise<void>((resolve) => {
                if (signal.aborted) {
                    resolve();
                    return;
                }

                signal.addEventListener("abort", () => resolve(), { once: true });
            });
        });
    });

    it("loads real conversations and restores selected metadata-only history", async () => {
        const { rerender } = render(
            <ChatWorkspace
                key={firstConversation.conversationId}
                initialConversationId={firstConversation.conversationId}
            />,
        );

        expect(screen.getByText("Loading conversations…")).toBeInTheDocument();
        expect(screen.getByText("Loading conversation…")).toBeInTheDocument();

        expect(await screen.findByRole("heading", { name: "Security review" })).toBeInTheDocument();
        expect(screen.getByText(/1 previous message summary is retained/)).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Stored answer" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Provider analysis/ })).toHaveAttribute(
            "href",
            `/chat/${secondConversation.conversationId}`,
        );

        fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
            target: { value: "Streaming request" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));
        await waitFor(() => expect(chatApi.streamChat).toHaveBeenCalledTimes(1));
        const activeSignal = chatApi.streamChat.mock.calls[0]?.[0].signal;

        rerender(
            <ChatWorkspace
                key={secondConversation.conversationId}
                initialConversationId={secondConversation.conversationId}
            />,
        );

        expect(activeSignal?.aborted).toBe(true);

        await waitFor(() => {
            expect(conversationApi.getConversation).toHaveBeenLastCalledWith(
                "access-token",
                secondConversation.conversationId,
                expect.any(AbortSignal),
            );
        });
        expect(await screen.findByRole("heading", { name: "Provider analysis" })).toBeInTheDocument();
        expect(conversationApi.createConversation).not.toHaveBeenCalled();
    });
});
