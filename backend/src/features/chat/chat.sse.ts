import { once } from "node:events";

import type { Response } from "express";

export type ChatSseEventName =
    | "request_started"
    | "policy"
    | "routing"
    | "fallback"
    | "token"
    | "done"
    | "error";

export function startSse(response: Response): void {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
}

export async function writeSseEvent(
    response: Response,
    event: ChatSseEventName,
    data: Readonly<Record<string, unknown>>,
): Promise<boolean> {
    if (response.destroyed || response.writableEnded) {
        return false;
    }

    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    if (response.write(frame)) {
        return true;
    }

    await Promise.race([
        once(response, "drain"),
        once(response, "close"),
    ]);

    return !response.destroyed && !response.writableEnded;
}
