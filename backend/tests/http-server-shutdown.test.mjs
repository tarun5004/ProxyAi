import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

const {
    CHAT_STREAM_SHUTDOWN_REASON,
    abortActiveChatStreams,
    registerActiveChatStream,
} = await import("../dist/shared/runtime/active-chat-streams.js");
const { closeHttpServerWithinGrace } = await import(
    "../dist/shared/runtime/http-server-shutdown.js"
);

test("active chat stream registry aborts registered streams only", () => {
    const active = new AbortController();
    const released = new AbortController();
    const unregisterActive = registerActiveChatStream(active);
    const unregisterReleased = registerActiveChatStream(released);

    unregisterReleased();

    assert.equal(abortActiveChatStreams(), 1);
    assert.equal(active.signal.aborted, true);
    assert.equal(active.signal.reason, CHAT_STREAM_SHUTDOWN_REASON);
    assert.equal(released.signal.aborted, false);

    unregisterActive();
    assert.equal(abortActiveChatStreams(), 0);
});

test("HTTP shutdown force-closes a long-lived response after grace", async () => {
    const server = createServer((_request, response) => {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.write("event: token\ndata: {}\n\n");
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();

    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    const response = await fetch(`http://127.0.0.1:${address.port}`);
    let abortCalls = 0;
    const result = await closeHttpServerWithinGrace(server, {
        graceMs: 10,
        forceCloseWaitMs: 500,
        abortStreams: () => {
            abortCalls += 1;
            return 2;
        },
    });

    assert.deepEqual(result, {
        abortedStreams: 2,
        closed: true,
        forced: true,
    });
    assert.equal(abortCalls, 1);
    assert.equal(server.listening, false);
    await response.body?.cancel().catch(() => undefined);
});
