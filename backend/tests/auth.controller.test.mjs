import assert from "node:assert/strict";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [{ createRefreshHandler, me }, { AppError }] = await Promise.all([
    import("../dist/features/auth/auth.controller.js"),
    import("../dist/shared/errors/app-error.js"),
]);

function createHarness(error, cookie = "proxiai_refresh=opaque-token") {
    const clearedCookies = [];
    let serviceCalls = 0;
    let statusCode;
    const handler = createRefreshHandler({
        async refreshSession() {
            serviceCalls += 1;
            throw error;
        },
    });
    const request = {
        headers: { cookie },
        log: { error() {}, info() {}, warn() {} },
        requestId: "request-auth-controller",
    };
    const response = {
        clearCookie(name, options) {
            clearedCookies.push({ name, options });
        },
        end() {},
        setHeader() {},
        status(value) {
            statusCode = value;
            return this;
        },
    };

    return {
        clearedCookies,
        handler,
        request,
        response,
        get serviceCalls() {
            return serviceCalls;
        },
        get statusCode() {
            return statusCode;
        },
    };
}

test("refresh treats a missing cookie as a clean anonymous session", async () => {
    const harness = createHarness(new Error("must not run"), "");

    await harness.handler(harness.request, harness.response);

    assert.equal(harness.statusCode, 204);
    assert.equal(harness.serviceCalls, 0);
    assert.equal(harness.clearedCookies.length, 1);
});

test("refresh preserves cookie on temporary service failure", async () => {
    const error = new AppError(
        503,
        "AUTH_TEMPORARILY_UNAVAILABLE",
        "Authentication is temporarily unavailable.",
    );
    const harness = createHarness(error);

    await assert.rejects(
        harness.handler(harness.request, harness.response),
        (caught) => caught === error,
    );
    assert.equal(harness.clearedCookies.length, 0);
});

test("refresh clears cookie on terminal invalid-token failure", async () => {
    const error = new AppError(
        401,
        "INVALID_REFRESH_TOKEN",
        "Session is invalid or expired.",
    );
    const harness = createHarness(error);

    await assert.rejects(
        harness.handler(harness.request, harness.response),
        (caught) => caught === error,
    );
    assert.equal(harness.clearedCookies.length, 1);
    assert.equal(harness.clearedCookies[0].name, "proxiai_refresh");
});

test("current session returns safe profile and retention context", () => {
    let body;
    const request = {
        auth: {
            userId: "11111111-1111-4111-8111-111111111111",
            orgId: "22222222-2222-4222-8222-222222222222",
            role: "EMPLOYEE",
            permissions: ["chat:send", "chat:view_own"],
            sessionId: "33333333-3333-4333-8333-333333333333",
        },
        authProfile: {
            userId: "11111111-1111-4111-8111-111111111111",
            email: "employee@example.com",
            displayName: "Example Employee",
            role: "EMPLOYEE",
            permissions: ["chat:send", "chat:view_own"],
            organisation: {
                orgId: "22222222-2222-4222-8222-222222222222",
                name: "Example Organisation",
                plan: "FREE",
                retentionMode: "METADATA_ONLY",
            },
        },
        requestId: "request-auth-me",
    };
    const response = {
        json(value) {
            body = value;
        },
        setHeader() {},
        status() {
            return this;
        },
    };

    me(request, response);

    assert.equal(body.data.user.displayName, "Example Employee");
    assert.equal(
        body.data.user.organisation.retentionMode,
        "METADATA_ONLY",
    );
    const output = JSON.stringify(body);
    assert.equal(output.includes("passwordHash"), false);
    assert.equal(output.includes("contentEnc"), false);
    assert.equal(output.includes("keyVersion"), false);
});
