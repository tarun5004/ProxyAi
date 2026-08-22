import type {
    DoneEvent,
    PolicyEvent,
    RoutingEvent,
} from "@/features/chat/chat.types";

export type RoutingDisplayStatus = "BLOCKED" | "NOT_ROUTED" | "PENDING" | "ROUTING" | "ROUTED";

export interface RoutingDisplayState {
    model: string;
    provider: string;
    routing: string;
    status: RoutingDisplayStatus;
}

export function getRoutingDisplayState(input: {
    completion?: DoneEvent;
    policy?: PolicyEvent;
    routing?: RoutingEvent;
    streaming: boolean;
}): RoutingDisplayState {
    if (input.policy?.action === "BLOCK") {
        return {
            model: "Blocked",
            provider: "Blocked",
            routing: "Blocked",
            status: "BLOCKED",
        };
    }

    if (input.completion) {
        return {
            model: input.completion.model,
            provider: input.completion.provider,
            routing: input.completion.routingReason,
            status: "ROUTED",
        };
    }

    if (input.routing) {
        return {
            model: "Pending",
            provider: input.routing.provider,
            routing: input.routing.routingReason,
            status: "ROUTING",
        };
    }

    if (input.streaming && input.policy) {
        return {
            model: "Pending",
            provider: "Routing",
            routing: "Routing",
            status: "ROUTING",
        };
    }

    if (input.streaming) {
        return {
            model: "Pending",
            provider: "Pending",
            routing: "Pending",
            status: "PENDING",
        };
    }

    return {
        model: "Not routed",
        provider: "Not routed",
        routing: "Not routed",
        status: "NOT_ROUTED",
    };
}
