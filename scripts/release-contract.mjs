import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const COVERAGE_THRESHOLDS = Object.freeze({
    backendLines: 75,
    frontendLines: 60,
    criticalBranches: 90,
});

export const CRITICAL_BACKEND_MODULES = Object.freeze([
    Object.freeze({
        name: "policy-evaluator",
        source: "dist/features/policy/policy-evaluator.js",
        tests: [
            "tests/policy-allow.test.mjs",
            "tests/policy-mask.test.mjs",
            "tests/policy-block.test.mjs",
            "tests/chat.stream.test.mjs",
        ],
    }),
    Object.freeze({
        name: "pii-risk-scorer",
        source: "dist/features/pii/pii-risk-scorer.js",
        tests: ["tests/pii-risk-scorer.test.mjs"],
    }),
    Object.freeze({
        name: "provider-fallback-routing",
        source: "dist/features/providers/provider-fallback.js",
        tests: ["tests/provider-fallback.test.mjs"],
    }),
    Object.freeze({
        name: "provider-retry-policy",
        source: "dist/features/providers/provider-retry.policy.js",
        tests: ["tests/provider-retry.policy.test.mjs"],
    }),
    Object.freeze({
        name: "provider-circuit-breaker",
        source: "dist/features/providers/provider-circuit-breaker.js",
        tests: ["tests/provider-circuit-breaker.test.mjs"],
    }),
    Object.freeze({
        name: "aes-gcm-encryption",
        source: "dist/shared/security/encryption.js",
        tests: [
            "tests/encryption.test.mjs",
            "tests/encryption-unconfigured.test.mjs",
        ],
    }),
    Object.freeze({
        name: "permission-authorization",
        source: "dist/features/auth/authorization.middleware.js",
        tests: [
            "tests/admin.phase8.test.mjs",
            "tests/conversation.create.test.mjs",
        ],
    }),
    Object.freeze({
        name: "admin-cursor",
        source: "dist/features/admin/admin.cursor.js",
        tests: ["tests/cursor-security.test.mjs"],
    }),
    Object.freeze({
        name: "conversation-cursor",
        source: "dist/features/conversations/conversation.cursor.js",
        tests: ["tests/cursor-security.test.mjs"],
    }),
    Object.freeze({
        name: "message-cursor",
        source: "dist/features/messages/message.cursor.js",
        tests: ["tests/cursor-security.test.mjs"],
    }),
]);

export const RELEASE_STEPS = Object.freeze([
    Object.freeze({ id: "backend-audit", cwd: "backend", command: "npm", args: ["audit", "--omit=dev", "--audit-level=high"], timeoutMs: 300_000 }),
    Object.freeze({ id: "backend-lint", cwd: "backend", command: "npm", args: ["run", "lint"], timeoutMs: 300_000 }),
    Object.freeze({ id: "backend-typecheck", cwd: "backend", command: "npm", args: ["run", "typecheck"], timeoutMs: 300_000 }),
    Object.freeze({ id: "backend-tests", cwd: "backend", command: "npm", args: ["test"], timeoutMs: 600_000 }),
    Object.freeze({ id: "backend-coverage", cwd: "backend", command: "npm", args: ["run", "test:coverage"], timeoutMs: 600_000 }),
    Object.freeze({ id: "backend-critical-coverage", cwd: "backend", command: "npm", args: ["run", "test:coverage:critical"], timeoutMs: 600_000 }),
    Object.freeze({ id: "backend-integration", cwd: ".", command: "node", args: ["scripts/verify-phase11-integration.mjs"], timeoutMs: 900_000 }),
    Object.freeze({ id: "backend-build", cwd: "backend", command: "npm", args: ["run", "build"], timeoutMs: 300_000 }),
    Object.freeze({ id: "frontend-audit", cwd: "frontend", command: "npm", args: ["audit", "--omit=dev", "--audit-level=high"], timeoutMs: 300_000 }),
    Object.freeze({ id: "frontend-lint", cwd: "frontend", command: "npm", args: ["run", "lint"], timeoutMs: 300_000 }),
    Object.freeze({ id: "frontend-typecheck", cwd: "frontend", command: "npm", args: ["run", "typecheck"], timeoutMs: 300_000 }),
    Object.freeze({ id: "frontend-tests", cwd: "frontend", command: "npm", args: ["test"], timeoutMs: 600_000 }),
    Object.freeze({ id: "frontend-coverage", cwd: "frontend", command: "npm", args: ["run", "test:coverage"], timeoutMs: 600_000 }),
    Object.freeze({ id: "frontend-build", cwd: "frontend", command: "npm", args: ["run", "build"], timeoutMs: 600_000 }),
    Object.freeze({ id: "security-scan", cwd: ".", command: "node", args: ["scripts/security-scan.mjs"], timeoutMs: 120_000 }),
    Object.freeze({ id: "deployment-contract", cwd: ".", command: "node", args: ["scripts/verify-deployment-contract.mjs"], timeoutMs: 300_000 }),
    Object.freeze({ id: "diff-check", cwd: ".", command: "git", args: ["diff", "--check"], timeoutMs: 120_000 }),
    Object.freeze({ id: "frontend-container", cwd: ".", command: "docker", args: ["build", "--tag", "proxiai-frontend:phase11", "frontend"], timeoutMs: 900_000 }),
    Object.freeze({ id: "backend-container", cwd: ".", command: "docker", args: ["build", "--tag", "proxiai-backend:phase11", "backend"], timeoutMs: 900_000 }),
    Object.freeze({ id: "container-contract", cwd: ".", command: "node", args: ["scripts/verify-container-contract.mjs"], timeoutMs: 300_000 }),
]);

export function assertCoverageAtLeast(actual, required, label) {
    if (!Number.isFinite(actual) || actual < required) {
        throw new Error(`${label} coverage ${actual}% is below ${required}%.`);
    }
}

export async function validateReleaseContract(rootDirectory) {
    const seenIds = new Set();
    const packageScripts = new Map();

    for (const workspace of ["backend", "frontend"]) {
        const packageJson = JSON.parse(await readFile(
            resolve(rootDirectory, workspace, "package.json"),
            "utf8",
        ));
        packageScripts.set(workspace, new Set(Object.keys(packageJson.scripts ?? {})));
    }

    for (const step of RELEASE_STEPS) {
        if (seenIds.has(step.id)) {
            throw new Error(`Duplicate release step: ${step.id}`);
        }
        seenIds.add(step.id);

        if (!Number.isInteger(step.timeoutMs) || step.timeoutMs <= 0) {
            throw new Error(`Release step has no bounded timeout: ${step.id}`);
        }

        if (step.command === "npm" && step.args[0] === "run") {
            const scriptName = step.args[1];
            if (!packageScripts.get(step.cwd)?.has(scriptName)) {
                throw new Error(`Missing ${step.cwd} package script: ${scriptName}`);
            }
        }
    }

    return { stepCount: RELEASE_STEPS.length };
}
