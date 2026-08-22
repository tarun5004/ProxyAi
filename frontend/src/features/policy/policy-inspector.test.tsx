import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PolicyInspector } from "./policy-inspector";

afterEach(cleanup);

describe("policy routing presentation", () => {
    it("shows only supplied routing and fallback metadata", () => {
        const { rerender } = render(
            <PolicyInspector
                routingDisplay={{
                    model: "Not routed",
                    provider: "Not routed",
                    routing: "Not routed",
                    status: "NOT_ROUTED",
                }}
                open
                onClose={vi.fn()}
            />,
        );

        expect(screen.queryByText("openai/gpt-oss-20b")).not.toBeInTheDocument();
        expect(screen.getAllByText("Not routed")).toHaveLength(3);

        rerender(
            <PolicyInspector
                completion={{
                    requestId: "55555555-5555-4555-8555-555555555555",
                    provider: "groq",
                    model: "authoritative-model",
                    routingReason: "ordered",
                    latencyMs: 80,
                    cacheHit: false,
                    masked: false,
                }}
                fallback={{
                    fromProvider: "primary",
                    toProvider: "groq",
                    reason: "unavailable",
                }}
                routingDisplay={{
                    model: "authoritative-model",
                    provider: "groq",
                    routing: "ordered",
                    status: "ROUTED",
                }}
                open
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByText("authoritative-model")).toBeInTheDocument();
        expect(screen.getByText("primary → groq")).toBeInTheDocument();
    });
});
