import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
    assertCoverageAtLeast,
    COVERAGE_THRESHOLDS,
    CRITICAL_BACKEND_MODULES,
    RELEASE_STEPS,
    resolveReleaseCommand,
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
            "admin-cursor",
            "conversation-cursor",
            "message-cursor",
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

test("integration gate serializes shared database suites with a bounded watchdog", async () => {
    const packageJson = JSON.parse(await readFile(
        resolve(rootDirectory, "backend", "package.json"),
        "utf8",
    ));
    const integrationCommand = packageJson.scripts?.["test:integration"];

    assert.equal(typeof integrationCommand, "string");
    assert.match(integrationCommand, /--test-concurrency=1(?:\s|$)/u);
    assert.match(integrationCommand, /--test-timeout=90000(?:\s|$)/u);
    assert.match(integrationCommand, /tests\/\*\.integration\.mjs/u);
    assert.doesNotMatch(integrationCommand, /--test-only|--test-skip-pattern/u);
});

test("Windows npm steps use the command shell without changing other commands", () => {
    assert.deepEqual(
        resolveReleaseCommand({ command: "npm" }, "win32"),
        { command: "npm", shell: true },
    );
    assert.deepEqual(
        resolveReleaseCommand({ command: "node" }, "win32"),
        { command: "node", shell: false },
    );
    assert.deepEqual(
        resolveReleaseCommand({ command: "npm" }, "linux"),
        { command: "npm", shell: false },
    );
});
