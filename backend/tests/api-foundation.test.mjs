import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import express from "express";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [
    { app },
    { AppError },
    { globalErrorHandler },
    { requestIdMiddleware },
    { createSuccessResponse },
] = await Promise.all([
    import("../dist/app.js"),
    import("../dist/shared/errors/app-error.js"),
    import("../dist/shared/middleware/error.middleware.js"),
    import("../dist/shared/middleware/request-id.middleware.js"),
    import("../dist/shared/responses/api-response.js"),
]);

async function startServer(application) {
    const server = application.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    return {
        origin: `http://127.0.0.1:${address.port}`,
        async stop() {
            server.close();
            await once(server, "close");
        },
    };
}

async function request(application, path, options) {
    const server = await startServer(application);

    try {
        return await fetch(`${server.origin}${path}`, options);
    } finally {
        await server.stop();
    }
}

function createErrorTestApp() {
    const testApp = express();

    testApp.use(requestIdMiddleware);
    testApp.get("/success", (request, response) => {
        response.status(200).json(
            createSuccessResponse({ value: "ok" }, request.requestId),
        );
    });
    testApp.get("/known-error", () => {
        throw new AppError(409, "STATE_CONFLICT", "State conflict.");
    });
    testApp.get("/unknown-error", () => {
        throw new Error("SENTINEL_INTERNAL_ERROR");
    });
    testApp.use(globalErrorHandler);

    return testApp;
}

test("request ID is server-generated and propagated", async () => {
    const response = await request(app, "/missing", {
        headers: {
            "X-Request-ID": "attacker-controlled-id",
        },
    });
    const body = await response.json();
    const requestId = response.headers.get("x-request-id");

    assert.notEqual(requestId, null);
    assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(requestId, "attacker-controlled-id");
    assert.equal(body.error.requestId, requestId);
});

test("success helper creates the approved envelope", async () => {
    const response = await request(createErrorTestApp(), "/success");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
        success: true,
        data: {
            value: "ok",
        },
        meta: {
            requestId: response.headers.get("x-request-id"),
        },
    });
});

test("known AppError keeps its safe status, code, and message", async () => {
    const response = await request(createErrorTestApp(), "/known-error");
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "STATE_CONFLICT");
    assert.equal(body.error.message, "State conflict.");
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
});

test("unknown errors are sanitized", async () => {
    const response = await request(createErrorTestApp(), "/unknown-error");
    const bodyText = await response.text();

    assert.equal(response.status, 500);
    assert.equal(bodyText.includes("SENTINEL_INTERNAL_ERROR"), false);
    assert.equal(bodyText.includes("stack"), false);
    assert.deepEqual(JSON.parse(bodyText), {
        success: false,
        error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred.",
            requestId: response.headers.get("x-request-id"),
        },
    });
});

test("unknown routes use the standard 404 envelope", async () => {
    const response = await request(app, "/does-not-exist");
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(body.error.message, "Route not found.");
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
});

test("JSON bodies above 1 MB use a safe 413 envelope", async () => {
    const response = await request(app, "/does-not-exist", {
        body: JSON.stringify({
            content: "x".repeat(1_048_576),
        }),
        headers: {
            "Content-Type": "application/json",
        },
        method: "POST",
    });
    const body = await response.json();

    assert.equal(response.status, 413);
    assert.equal(body.error.code, "PAYLOAD_TOO_LARGE");
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
});

test("configured CORS origin is allowed with credentials", async () => {
    const response = await request(app, "/health/live", {
        headers: {
            Origin: process.env.FRONTEND_ORIGIN,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(
        response.headers.get("access-control-allow-origin"),
        process.env.FRONTEND_ORIGIN,
    );
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
});

test("unapproved browser origins are rejected safely", async () => {
    const response = await request(app, "/health/live", {
        headers: {
            Origin: "https://unapproved.example",
        },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(body.error.code, "CORS_ORIGIN_DENIED");
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
});

test("requests without Origin remain available to non-browser clients", async () => {
    const response = await request(app, "/health/live");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("Helmet adds security headers and Express branding is disabled", async () => {
    const response = await request(app, "/health/live");

    assert.notEqual(response.headers.get("content-security-policy"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(response.headers.get("x-powered-by"), null);
});
