import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatCenter } from "./chat-center";

describe("chat message presentation", () => {
    it("renders assistant Markdown and tables without interpreting raw HTML or user markup", () => {
        const { container } = render(
            <ChatCenter
                title="Markdown review"
                retainedMessages={[]}
                conversationStatus="ready"
                streaming={false}
                onSend={vi.fn()}
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
    });
});
