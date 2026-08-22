import { createApiPath } from "@/lib/api/api-path";
import { ApiError } from "@/lib/errors/api-error";
import { readSseStream } from "@/lib/streaming/sse-parser";

import { chatEventSchemas, type ChatEvent } from "./chat.types";

export async function* streamChat(input: {
    accessToken: string;
    clientRequestId: string;
    conversationId: string;
    prompt: string;
    signal: AbortSignal;
}): AsyncGenerator<ChatEvent> {
    const response = await fetch(
        createApiPath("/chat/stream"),
        {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            signal: input.signal,
            headers: {
                accept: "text/event-stream",
                authorization: `Bearer ${input.accessToken}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                conversationId: input.conversationId,
                prompt: input.prompt,
                clientRequestId: input.clientRequestId,
                providerId: "groq",
                routingMode: "manual",
            }),
        },
    );

    if (!response.ok) {
        throw await ApiError.fromResponse(response);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream") || !response.body) {
        throw new ApiError({
            status: response.status,
            code: "INVALID_STREAM_RESPONSE",
            message: "The chat stream could not be opened.",
        });
    }

    let terminalEventReceived = false;

    for await (const event of readSseStream(response.body)) {
        if (!(event.event in chatEventSchemas)) {
            continue;
        }

        const eventName = event.event as keyof typeof chatEventSchemas;
        const schema = chatEventSchemas[eventName];
        const data = schema.parse(event.data);

        yield { type: eventName, data } as ChatEvent;

        if (eventName === "done" || eventName === "error") {
            terminalEventReceived = true;
        }
    }

    if (!terminalEventReceived && !input.signal.aborted) {
        throw new ApiError({
            status: response.status,
            code: "STREAM_INTERRUPTED",
            message: "The chat stream ended before a terminal event.",
        });
    }
}
