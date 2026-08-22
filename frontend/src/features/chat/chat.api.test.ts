import { afterEach, describe, expect, it, vi } from "vitest";

import { streamChat } from "./chat.api";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("chat stream protocol", () => {
    it("rejects clean EOF when no terminal SSE event arrives", async () => {
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(
                    "event: token\ndata: {\"text\":\"partial\"}\n\n",
                ));
                controller.close();
            },
        });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
        })));

        async function collect() {
            const events = [];

            for await (const event of streamChat({
                accessToken: "access-token",
                clientRequestId: "22222222-2222-4222-8222-222222222222",
                conversationId: "11111111-1111-4111-8111-111111111111",
                prompt: "safe prompt",
                signal: new AbortController().signal,
            })) {
                events.push(event);
            }

            return events;
        }

        await expect(collect()).rejects.toMatchObject({
            code: "STREAM_INTERRUPTED",
        });
        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: JSON.stringify({
                    conversationId: "11111111-1111-4111-8111-111111111111",
                    prompt: "safe prompt",
                    clientRequestId: "22222222-2222-4222-8222-222222222222",
                    providerId: "groq",
                    routingMode: "manual",
                }),
            }),
        );
    });
});
