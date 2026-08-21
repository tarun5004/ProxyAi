import type { Server } from "node:http";

import { abortActiveChatStreams } from "./active-chat-streams.js";

export const HTTP_SHUTDOWN_GRACE_MS = 20_000;
export const HTTP_FORCE_CLOSE_WAIT_MS = 5_000;

export interface HttpServerShutdownResult {
    readonly closed: boolean;
    readonly forced: boolean;
    readonly abortedStreams: number;
}

export async function closeHttpServerWithinGrace(
    server: Server,
    options: {
        readonly graceMs?: number;
        readonly forceCloseWaitMs?: number;
        readonly abortStreams?: () => number;
    } = {},
): Promise<HttpServerShutdownResult> {
    const graceMs = options.graceMs ?? HTTP_SHUTDOWN_GRACE_MS;
    const forceCloseWaitMs = options.forceCloseWaitMs
        ?? HTTP_FORCE_CLOSE_WAIT_MS;
    const abortStreams = options.abortStreams ?? abortActiveChatStreams;

    return new Promise((resolve) => {
        let settled = false;
        let forced = false;
        let abortedStreams = 0;

        const finish = (closed: boolean) => {
            if (settled) {
                return;
            }

            settled = true;

            clearTimeout(forceTimer);
            clearTimeout(deadlineTimer);

            resolve(Object.freeze({ closed, forced, abortedStreams }));
        };

        const forceTimer = setTimeout(() => {
            forced = true;
            abortedStreams = abortStreams();
            server.closeAllConnections();
        }, graceMs);
        const deadlineTimer = setTimeout(() => {
            finish(false);
        }, graceMs + forceCloseWaitMs);

        try {
            server.close((error) => {
                finish(error === undefined);
            });
        } catch {
            finish(false);
        }
    });
}
