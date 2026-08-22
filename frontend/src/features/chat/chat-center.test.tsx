import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatCenter } from "./chat-center";

const originalInnerWidth = window.innerWidth;

afterEach(() => {
    cleanup();
    Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth,
    });
});

const defaultProps = {
    title: "Security review",
    retainedMessages: [],
    conversationStatus: "ready" as const,
    error: undefined,
    onSend: vi.fn(async () => undefined),
    onOpenConversations: vi.fn(),
};

function configureScrollViewport(element: HTMLElement, initialScrollTop: number) {
    let clientHeight = 400;
    let scrollHeight = 1_000;
    let scrollTop = initialScrollTop;
    const scrollTo = vi.fn((options: ScrollToOptions) => {
        if (typeof options.top === "number") {
            scrollTop = options.top;
        }
    });

    Object.defineProperties(element, {
        clientHeight: {
            configurable: true,
            get: () => clientHeight,
        },
        scrollHeight: {
            configurable: true,
            get: () => scrollHeight,
        },
        scrollTop: {
            configurable: true,
            get: () => scrollTop,
            set: (value: number) => {
                scrollTop = value;
            },
        },
        scrollTo: {
            configurable: true,
            value: scrollTo,
        },
    });

    return {
        scrollTo,
        setMetrics(metrics: {
            clientHeight?: number;
            scrollHeight?: number;
            scrollTop?: number;
        }) {
            clientHeight = metrics.clientHeight ?? clientHeight;
            scrollHeight = metrics.scrollHeight ?? scrollHeight;
            scrollTop = metrics.scrollTop ?? scrollTop;
        },
    };
}

describe("chat message presentation", () => {
    it("follows streaming chunks near the bottom and follows the final state", () => {
        const initialMessage = {
            id: "assistant-message",
            role: "assistant" as const,
            content: "Initial response",
            state: "complete" as const,
        };
        const { rerender } = render(
            <ChatCenter
                {...defaultProps}
                streaming={false}
                messages={[initialMessage]}
            />,
        );
        const viewport = screen.getByLabelText("Conversation messages");
        const scroll = configureScrollViewport(viewport, 520);

        fireEvent.scroll(viewport);
        scroll.setMetrics({ scrollHeight: 1_200 });
        rerender(
            <ChatCenter
                {...defaultProps}
                streaming
                messages={[{
                    ...initialMessage,
                    content: "Initial response with another streamed chunk",
                    state: "streaming",
                }]}
            />,
        );

        expect(scroll.scrollTo).toHaveBeenLastCalledWith({
            behavior: "auto",
            top: 1_200,
        });

        scroll.setMetrics({ scrollHeight: 1_400 });
        rerender(
            <ChatCenter
                {...defaultProps}
                streaming={false}
                messages={[{
                    ...initialMessage,
                    content: "Complete response",
                }]}
            />,
        );

        expect(scroll.scrollTo).toHaveBeenLastCalledWith({
            behavior: "auto",
            top: 1_400,
        });
    });

    it("preserves manual scroll position and resumes from the mobile-safe jump control", () => {
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            value: 390,
        });
        const initialMessage = {
            id: "assistant-message",
            role: "assistant" as const,
            content: "Initial response",
            state: "complete" as const,
        };
        const { rerender } = render(
            <ChatCenter
                {...defaultProps}
                streaming={false}
                messages={[initialMessage]}
            />,
        );
        const viewport = screen.getByLabelText("Conversation messages");
        const scroll = configureScrollViewport(viewport, 100);

        fireEvent.scroll(viewport);
        expect(screen.getByRole("button", { name: "Jump to latest message" })).toBeVisible();

        scroll.setMetrics({ scrollHeight: 1_300 });
        rerender(
            <ChatCenter
                {...defaultProps}
                streaming
                messages={[{
                    ...initialMessage,
                    content: "A long streamed response",
                    state: "streaming",
                }]}
            />,
        );
        expect(scroll.scrollTo).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Jump to latest message" }));
        expect(scroll.scrollTo).toHaveBeenLastCalledWith({
            behavior: "smooth",
            top: 1_300,
        });
        expect(screen.queryByRole("button", { name: "Jump to latest message" })).not.toBeInTheDocument();

        scroll.setMetrics({ scrollHeight: 1_500 });
        rerender(
            <ChatCenter
                {...defaultProps}
                streaming
                messages={[{
                    ...initialMessage,
                    content: "A long streamed response with its next chunk",
                    state: "streaming",
                }]}
            />,
        );
        expect(scroll.scrollTo).toHaveBeenLastCalledWith({
            behavior: "auto",
            top: 1_500,
        });
    });

    it("renders assistant Markdown and tables without interpreting raw HTML or user markup", () => {
        let finishSend: (() => void) | undefined;
        const onSend = vi.fn(() => new Promise<void>((resolve) => {
            finishSend = resolve;
        }));
        const { container } = render(
            <ChatCenter
                title="Markdown review"
                retainedMessages={[]}
                conversationStatus="ready"
                streaming={false}
                onSend={onSend}
                onOpenConversations={vi.fn()}
                messages={[
                    {
                        id: "user-message",
                        role: "user",
                        content: "<strong>User input stays plain</strong>",
                        state: "complete",
                    },
                    {
                        id: "assistant-message",
                        role: "assistant",
                        content: [
                            "# Security summary",
                            "",
                            "- First finding",
                            "- Second finding",
                            "",
                            "| Control | Status |",
                            "| --- | --- |",
                            "| Tenant scope | Pass |",
                            "",
                            "Use `orgId` in every query.",
                            "",
                            "```ts",
                            "const safe = true;",
                            "```",
                            "",
                            "[Approved docs](https://example.com/docs)",
                            "<img src=x onerror=alert(1)>",
                        ].join("\n"),
                        state: "complete",
                    },
                ]}
            />,
        );

        expect(screen.getByRole("heading", { name: "Security summary" })).toBeInTheDocument();
        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByText("First finding")).toBeInTheDocument();
        expect(screen.getByText("const safe = true;")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Approved docs" })).toHaveAttribute(
            "href",
            "https://example.com/docs",
        );
        expect(screen.getByText("<strong>User input stays plain</strong>")).toBeInTheDocument();
        expect(container.querySelector("[onerror]")).toBeNull();
        expect(container.querySelector("script")).toBeNull();

        const composer = screen.getByRole("textbox", { name: "Message" });
        fireEvent.change(composer, { target: { value: "Line one" } });
        expect(fireEvent.keyDown(composer, { key: "Enter", shiftKey: true })).toBe(true);
        fireEvent.change(composer, { target: { value: "Line one\nLine two" } });
        expect(composer).toHaveValue("Line one\nLine two");
        expect(onSend).not.toHaveBeenCalled();

        fireEvent.change(composer, { target: { value: "   " } });
        fireEvent.keyDown(composer, { key: "Enter" });
        expect(onSend).not.toHaveBeenCalled();

        fireEvent.change(composer, { target: { value: "Send securely" } });
        expect(fireEvent.keyDown(composer, { key: "Enter" })).toBe(false);
        fireEvent.keyDown(composer, { key: "Enter" });
        expect(onSend).toHaveBeenCalledTimes(1);
        expect(onSend).toHaveBeenCalledWith("Send securely");

        act(() => finishSend?.());
        return waitFor(() => expect(composer).toHaveFocus());
    });
});
