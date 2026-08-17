import { describe, expect, it } from "vitest";

import { parseSseFrames, readSseStream } from "./sse-parser";

describe("SSE parser", () => {
    it("preserves a frame split across network chunks", () => {
        const first = parseSseFrames(
            'event: token\ndata: {"text":"hel',
        );

        expect(first.events).toEqual([]);

        const second = parseSseFrames(
            `${first.remainder}lo"}\n\n`,
        );

        expect(second.events).toEqual([
            { event: "token", data: { text: "hello" } },
        ]);
        expect(second.remainder).toBe("");
    });

    it("streams ordered events from multiple byte chunks", async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    encoder.encode('event: policy\ndata: {"action":"ALLOW"}\n\n'),
                );
                controller.enqueue(
                    encoder.encode('event: token\ndata: {"text":"ok"}\n\n'),
                );
                controller.close();
            },
        });
        const events = [];

        for await (const event of readSseStream(stream)) {
            events.push(event);
        }

        expect(events).toEqual([
            { event: "policy", data: { action: "ALLOW" } },
            { event: "token", data: { text: "ok" } },
        ]);
    });
});
