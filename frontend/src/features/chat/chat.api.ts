import { publicEnvironment } from "@/lib/env/public-env";
import { ApiError } from "@/lib/errors/api-error";
import { readSseStream } from "@/lib/streaming/sse-parser";

import { chatEventSchemas, type ChatEvent } from "./chat.types";

export async function* streamChat(input: {
    accessToken: string;
    conversationId: string;
    prompt: string;
    signal: AbortSignal;
}): AsyncGenerator<ChatEvent> {
    const response = await fetch(
        `${publicEnvironment.NEXT_PUBLIC_API_BASE_URL}/chat/stream`,
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
                clientRequestId: crypto.randomUUID(),
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

    for await (const event of readSseStream(response.body)) {
        if (!(event.event in chatEventSchemas)) {
            continue;
        }

        const eventName = event.event as keyof typeof chatEventSchemas;
        const schema = chatEventSchemas[eventName];
        const data = schema.parse(event.data);

        yield { type: eventName, data } as ChatEvent;
    }
}
