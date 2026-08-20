import assert from "node:assert/strict";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();

const [{ createRefreshHandler }, { AppError }] = await Promise.all([
    import("../dist/features/auth/auth.controller.js"),
    import("../dist/shared/errors/app-error.js"),
]);

function createHarness(error) {
    const clearedCookies = [];
    const handler = createRefreshHandler({
        async refreshSession() {
            throw error;
        },
    });
    const request = {
        headers: { cookie: "proxiai_refresh=opaque-token" },
        log: { error() {}, info() {}, warn() {} },
        requestId: "request-auth-controller",
    };
    const response = {
        clearCookie(name, options) {
            clearedCookies.push({ name, options });
        },
    };

    return { clearedCookies, handler, request, response };
}

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
