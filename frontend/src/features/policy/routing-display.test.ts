import { describe, expect, it } from "vitest";

import { getRoutingDisplayState } from "./routing-display";

describe("authoritative routing display", () => {
    it("shows not routed and pending without inventing provider metadata", () => {
        expect(getRoutingDisplayState({ streaming: false })).toEqual({
            model: "Not routed",
            provider: "Not routed",
            routing: "Not routed",
            status: "NOT_ROUTED",
        });
        expect(getRoutingDisplayState({ streaming: true })).toEqual({
            model: "Pending",
            provider: "Pending",
            routing: "Pending",
            status: "PENDING",
        });
    });

    it("shows routing evidence before the completion model is known", () => {
        expect(getRoutingDisplayState({
            streaming: true,
            routing: {
                provider: "groq",
                routingReason: "ordered",
                fallbackPosition: 0,
            },
        })).toEqual({
            model: "Pending",
            provider: "groq",
            routing: "ordered",
            status: "ROUTING",
        });
    });

    it("uses actual completed provider and model metadata", () => {
        expect(getRoutingDisplayState({
            streaming: false,
            completion: {
                requestId: "55555555-5555-4555-8555-555555555555",
                provider: "groq",
                model: "authoritative-model",
                routingReason: "ordered",
                latencyMs: 80,
                cacheHit: false,
                masked: false,
            },
        })).toEqual({
            model: "authoritative-model",
            provider: "groq",
            routing: "ordered",
            status: "ROUTED",
        });
    });

    it("shows blocked even if stale routing metadata is present", () => {
        expect(getRoutingDisplayState({
            streaming: false,
            policy: {
                action: "BLOCK",
                riskScore: 75,
                categories: ["CREDENTIAL"],
                masked: false,
            },
            routing: {
                provider: "stale-provider",
                routingReason: "stale",
                fallbackPosition: 0,
            },
        })).toEqual({
            model: "Blocked",
            provider: "Blocked",
            routing: "Blocked",
            status: "BLOCKED",
        });
    });
});
