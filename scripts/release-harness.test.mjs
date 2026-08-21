import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
    assertCoverageAtLeast,
    COVERAGE_THRESHOLDS,
    CRITICAL_BACKEND_MODULES,
    RELEASE_STEPS,
    validateReleaseContract,
} from "./release-contract.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("release contract exposes the approved thresholds and critical modules", () => {
    assert.deepEqual(COVERAGE_THRESHOLDS, {
        backendLines: 75,
        frontendLines: 60,
        criticalBranches: 90,
    });
    assert.deepEqual(
        CRITICAL_BACKEND_MODULES.map(({ name }) => name),
        [
            "policy-evaluator",
            "pii-risk-scorer",
            "provider-fallback-routing",
            "provider-retry-policy",
            "provider-circuit-breaker",
            "aes-gcm-encryption",
            "permission-authorization",
        ],
    );
});

test("coverage threshold helper fails closed", () => {
    assert.doesNotThrow(() => assertCoverageAtLeast(75, 75, "backend lines"));
    assert.throws(
        () => assertCoverageAtLeast(74.99, 75, "backend lines"),
        /below 75%/u,
    );
    assert.throws(
        () => assertCoverageAtLeast(Number.NaN, 75, "backend lines"),
        /below 75%/u,
    );
});

test("release command manifest references valid workspace scripts", async () => {
    const result = await validateReleaseContract(rootDirectory);
    assert.equal(result.stepCount, RELEASE_STEPS.length);
    assert.equal(new Set(RELEASE_STEPS.map(({ id }) => id)).size, RELEASE_STEPS.length);
    assert.ok(RELEASE_STEPS.every(({ timeoutMs }) => timeoutMs > 0));
});
