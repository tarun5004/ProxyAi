import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatCenter } from "./chat-center";

describe("chat message presentation", () => {
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
