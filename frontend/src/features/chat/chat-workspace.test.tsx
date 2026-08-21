import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/errors/api-error";

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
    afterEach(() => {
        cleanup();
    });

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

    it("renders masked policy and a successful terminal stream without exposing a raw provider payload", async () => {
        chatApi.streamChat.mockImplementationOnce(async function* () {
            yield {
                type: "policy",
                data: {
                    action: "ALLOW_WITH_MASK",
                    riskScore: 32,
                    categories: ["CONTACT_INFO"],
                    masked: true,
                },
            };
            yield {
                type: "routing",
                data: { provider: "groq", routingReason: "ordered", fallbackPosition: 0 },
            };
            yield { type: "token", data: { text: "Sanitized " } };
            yield { type: "token", data: { text: "answer" } };
            yield {
                type: "done",
                data: {
                    requestId: "55555555-5555-4555-8555-555555555555",
                    provider: "groq",
                    model: "openai/gpt-oss-20b",
                    routingReason: "ordered",
                    usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
                    latencyMs: 120,
                    cacheHit: false,
                    masked: true,
                },
            };
        });
        render(<ChatWorkspace initialConversationId={firstConversation.conversationId} />);

        await screen.findByRole("heading", { name: "Security review" });
        fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
            target: { value: "Contact alice@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        expect(await screen.findByText("Sanitized answer")).toBeInTheDocument();
        expect(screen.getByText("ALLOW WITH MASK")).toBeInTheDocument();
        expect(screen.getByText("CONTACT INFO")).toBeInTheDocument();
        expect(screen.getByText("Applied")).toBeInTheDocument();
        expect(screen.getByText("7")).toBeInTheDocument();
        expect(chatApi.streamChat).toHaveBeenCalledWith(expect.objectContaining({
            prompt: "Contact alice@example.com",
        }));
    });

    it("shows a safe BLOCK decision when the backend rejects before streaming", async () => {
        chatApi.streamChat.mockImplementationOnce(async function* () {
            throw new ApiError({
                status: 403,
                code: "POLICY_BLOCKED",
                message: "Policy blocked.",
                requestId: "66666666-6666-4666-8666-666666666666",
                details: { riskScore: 75, categories: ["CREDENTIAL", "UNSUPPORTED"] },
            });
        });
        render(<ChatWorkspace initialConversationId={firstConversation.conversationId} />);

        await screen.findByRole("heading", { name: "Security review" });
        fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
            target: { value: "blocked sentinel" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        expect(await screen.findByText("BLOCK")).toBeInTheDocument();
        expect(screen.getByText("CREDENTIAL")).toBeInTheDocument();
        expect(screen.queryByText("UNSUPPORTED")).not.toBeInTheDocument();
        expect(screen.getByText(
            "Your organisation policy blocked this request before provider execution.",
        )).toBeInTheDocument();
        expect(screen.queryByText("Policy blocked.")).not.toBeInTheDocument();
    });
});
