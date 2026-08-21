import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { RELEASE_STEPS, validateReleaseContract } from "./release-contract.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const listOnly = process.argv.includes("--list");
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const onlyStepId = onlyArgument?.slice("--only=".length);

function terminateProcessTree(childProcess) {
    if (childProcess.pid === undefined) {
        return;
    }

    if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(childProcess.pid), "/t", "/f"], {
            stdio: "ignore",
        });
        return;
    }

    try {
        process.kill(-childProcess.pid, "SIGTERM");
    } catch {
        childProcess.kill("SIGTERM");
    }
}

function runBoundedStep(step, command) {
    return new Promise((resolveStep) => {
        const childProcess = spawn(command, step.args, {
            cwd: resolve(rootDirectory, step.cwd),
            detached: process.platform !== "win32",
            env: { ...process.env, CI: "true", NO_COLOR: "1" },
            stdio: "inherit",
        });
        let timedOut = false;
        let settled = false;
        const settle = (result) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);
            resolveStep(result);
        };
        const timeout = setTimeout(() => {
            timedOut = true;
            terminateProcessTree(childProcess);
        }, step.timeoutMs);

        childProcess.once("error", (error) => {
            settle({ error, status: 1, timedOut: false });
        });
        childProcess.once("exit", (code) => {
            settle({ status: code ?? 1, timedOut });
        });
    });
}

await validateReleaseContract(rootDirectory);

if (listOnly) {
    process.stdout.write(`${JSON.stringify(RELEASE_STEPS, null, 2)}\n`);
    process.exit(0);
}

const selectedSteps = onlyStepId === undefined
    ? RELEASE_STEPS
    : RELEASE_STEPS.filter(({ id }) => id === onlyStepId);

if (selectedSteps.length === 0) {
    throw new Error(`Unknown release step: ${onlyStepId}`);
}

const summary = [];

for (const step of selectedSteps) {
    const startedAt = Date.now();
    process.stdout.write(`\n[release] ${step.id}\n`);
    const command = process.platform === "win32" && step.command === "npm"
        ? "npm.cmd"
        : step.command;
    const result = await runBoundedStep(step, command);
    const status = result.status;
    summary.push({
        id: step.id,
        status: status === 0 ? "PASS" : "FAIL",
        durationMs: Date.now() - startedAt,
        ...(result.timedOut ? { timedOut: true } : {}),
    });

    if (result.error) {
        process.stderr.write(`${result.error.message}\n`);
    }
    if (result.timedOut) {
        process.stderr.write(`Release step timed out after ${step.timeoutMs}ms: ${step.id}\n`);
    }
    if (status !== 0) {
        process.stdout.write(`${JSON.stringify({ phase: 11, status: "FAIL", steps: summary }, null, 2)}\n`);
        process.exit(status);
    }
}

process.stdout.write(`${JSON.stringify({ phase: 11, status: "PASS", steps: summary }, null, 2)}\n`);
