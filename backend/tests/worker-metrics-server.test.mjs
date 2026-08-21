import assert from "node:assert/strict";
import { once } from "node:events";
import test, { afterEach } from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.LOG_LEVEL = "fatal";

const {
    closeWorkerMetricsServer,
    startWorkerMetricsServer,
} = await import("../dist/shared/observability/worker-metrics-server.js");

afterEach(async () => {
    await closeWorkerMetricsServer();
});

test("worker exposes one private metrics listener and closes it cleanly", async () => {
    const server = await startWorkerMetricsServer({
        host: "127.0.0.1",
        port: 0,
    });
    const duplicateStart = await startWorkerMetricsServer({
        host: "127.0.0.1",
        port: 0,
    });
    const address = server.address();

    assert.equal(duplicateStart, server);
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/metrics`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
    assert.match(body, /proxiai_dependency_ready\{dependency="mongodb"\} 0/);
    assert.match(body, /proxiai_dependency_ready\{dependency="redis"\} 0/);

    const closed = once(server, "close");
    assert.equal(await closeWorkerMetricsServer(), true);
    await closed;
    assert.equal(server.listening, false);
});

test("worker metrics listener exposes no application routes", async () => {
    const server = await startWorkerMetricsServer({
        host: "127.0.0.1",
        port: 0,
    });
    const address = server.address();

    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);
    assert.equal(response.status, 404);
});
