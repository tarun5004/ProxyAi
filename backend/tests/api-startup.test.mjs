import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_startup_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [
    { app },
    mongooseModule,
    redisModule,
    listenerModule,
    runtimeModule,
    startupModule,
] = await Promise.all([
    import("../dist/app.js"),
    import("mongoose"),
    import("../dist/shared/lib/redis.js"),
    import("../dist/shared/runtime/api-listener.js"),
    import("../dist/shared/runtime/api-runtime-state.js"),
    import("../dist/shared/runtime/api-startup.js"),
]);

const mongoose = mongooseModule.default;
const { redis } = redisModule;
const { API_LISTEN_HOST, openApiListener } = listenerModule;
const {
    getApiRuntimeState,
    markApiRuntimeStarting,
} = runtimeModule;
const { shutdownApiRuntime, startApiRuntime } = startupModule;

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, reject, resolve };
}

async function waitFor(predicate) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) {
            return;
        }

        await new Promise((resolve) => setImmediate(resolve));
    }

    assert.fail("Timed out waiting for startup state.");
}

async function request(server, path) {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    return fetch(`http://127.0.0.1:${address.port}${path}`);
}

async function closeServer(server) {
    server.close();
    await once(server, "close");
}

function setDependencyStates(mongoState, redisStatus) {
    Object.defineProperty(mongoose.connection, "readyState", {
        configurable: true,
        value: mongoState,
    });
    Object.defineProperty(redis, "status", {
        configurable: true,
        value: redisStatus,
    });
}

test("listener serves liveness while dependencies start and readiness flips after queues connect", async () => {
    const originalMongoState = mongoose.connection.readyState;
    const originalRedisStatus = redis.status;
    const mongo = createDeferred();
    const redisConnection = createDeferred();
    const queues = createDeferred();
    const events = [];
    let server;
    let listenHost;

    setDependencyStates(0, "wait");

    const startup = startApiRuntime({
        initializeEncryption() {
            events.push("encryption_initialized");
        },
        async startHttpListener() {
            server = await openApiListener((port, host, onListening) => {
                listenHost = host;
                events.push("listener_started");
                return app.listen(port, host, onListening);
            }, 0);
        },
        async connectMongo() {
            events.push("mongo_started");
            await mongo.promise;
        },
        async connectRedis() {
            events.push("redis_started");
            await redisConnection.promise;
        },
        async assertEncryptionStorageReady() {
            events.push("encryption_ready");
        },
        async connectAsyncInfrastructure() {
            events.push("queues_started");
            await queues.promise;
        },
        isShutdownRequested: () => false,
    });

    try {
        await waitFor(() => server !== undefined
            && events.includes("mongo_started")
            && events.includes("redis_started"));

        assert.equal(listenHost, "0.0.0.0");
        assert.equal(events.indexOf("listener_started")
            < events.indexOf("mongo_started"), true);
        assert.equal(events.indexOf("listener_started")
            < events.indexOf("redis_started"), true);

        const liveResponse = await request(server, "/health/live");
        const startingReadyResponse = await request(server, "/health/ready");
        const startingApiResponse = await request(server, "/api/v1/auth/me");
        const startingApiBody = await startingApiResponse.json();

        assert.equal(liveResponse.status, 200);
        assert.equal(startingReadyResponse.status, 503);
        assert.equal(startingApiResponse.status, 503);
        assert.equal(startingApiBody.error.code, "SERVICE_STARTING");

        setDependencyStates(1, "ready");
        mongo.resolve();
        redisConnection.resolve();
        await waitFor(() => events.includes("queues_started"));

        const queuePendingResponse = await request(server, "/health/ready");
        assert.equal(queuePendingResponse.status, 503);

        queues.resolve();
        await assert.doesNotReject(startup);
        assert.equal(getApiRuntimeState(), "READY");

        const readyResponse = await request(server, "/health/ready");
        const protectedResponse = await request(server, "/api/v1/auth/me");

        assert.equal(readyResponse.status, 200);
        assert.equal(protectedResponse.status, 401);
    } finally {
        mongo.resolve();
        redisConnection.resolve();
        queues.resolve();
        await startup.catch(() => undefined);
        if (server !== undefined) {
            await closeServer(server);
        }
        setDependencyStates(originalMongoState, originalRedisStatus);
        markApiRuntimeStarting();
    }
});

test("dependency startup failure keeps health live and business APIs unavailable", async () => {
    const mongo = createDeferred();
    let server;

    const startup = startApiRuntime({
        initializeEncryption() {},
        async startHttpListener() {
            server = await openApiListener(
                (port, host, onListening) => app.listen(
                    port,
                    host,
                    onListening,
                ),
                0,
            );
        },
        async connectMongo() {
            await mongo.promise;
        },
        async connectRedis() {},
        async assertEncryptionStorageReady() {},
        async connectAsyncInfrastructure() {},
        isShutdownRequested: () => false,
    });

    try {
        await waitFor(() => server !== undefined);
        mongo.reject(new Error("SENTINEL_DEPENDENCY_FAILURE"));
        await assert.rejects(startup, (error) => {
            assert.equal(error.startupStage, "mongo_connection");
            assert.equal(error.errorCode, "MONGODB_CONNECTION_FAILED");
            assert.equal(error.message.includes("SENTINEL"), false);
            return true;
        });

        const liveResponse = await request(server, "/health/live");
        const readyResponse = await request(server, "/health/ready");
        const apiResponse = await request(server, "/api/v1/auth/me");
        const apiBody = await apiResponse.json();

        assert.equal(liveResponse.status, 200);
        assert.equal(readyResponse.status, 503);
        assert.equal(apiResponse.status, 503);
        assert.equal(apiBody.error.code, "SERVICE_UNAVAILABLE");
    } finally {
        mongo.resolve();
        await startup.catch(() => undefined);
        if (server !== undefined) {
            await closeServer(server);
        }
        markApiRuntimeStarting();
    }
});

test("listener honors the supplied Render port and binds all interfaces", async () => {
    const fakeServer = new EventEmitter();
    const observed = {};

    const openedServer = await openApiListener((port, host, onListening) => {
        observed.port = port;
        observed.host = host;
        setImmediate(onListening);
        return fakeServer;
    }, 10_000);

    assert.equal(openedServer, fakeServer);
    assert.deepEqual(observed, {
        host: API_LISTEN_HOST,
        port: 10_000,
    });
});

test("graceful runtime shutdown closes HTTP before shared infrastructure", async () => {
    const events = [];

    const closed = await shutdownApiRuntime({
        async closeHttpServer() {
            events.push("http_closed");
            return true;
        },
        async disconnectInfrastructure() {
            events.push("mongo_redis_queues_closed");
            return true;
        },
    });

    assert.equal(closed, true);
    assert.deepEqual(events, [
        "http_closed",
        "mongo_redis_queues_closed",
    ]);
    assert.equal(getApiRuntimeState(), "STOPPING");
    markApiRuntimeStarting();
});
