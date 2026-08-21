import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
    COVERAGE_THRESHOLDS,
    CRITICAL_BACKEND_MODULES,
} from "./release-contract.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDirectory = resolve(rootDirectory, "backend");

for (const criticalModule of CRITICAL_BACKEND_MODULES) {
    process.stdout.write(`\n[critical-coverage] ${criticalModule.name}\n`);
    const result = spawnSync(
        process.execPath,
        [
            "--test",
            "--experimental-test-coverage",
            `--test-coverage-include=${criticalModule.source}`,
            `--test-coverage-branches=${COVERAGE_THRESHOLDS.criticalBranches}`,
            ...criticalModule.tests,
        ],
        {
            cwd: backendDirectory,
            env: { ...process.env, NO_COLOR: "1" },
            stdio: "inherit",
            timeout: 120_000,
        },
    );

    if (result.error) {
        if (result.error.code === "ETIMEDOUT") {
            process.stderr.write(`Critical coverage timed out: ${criticalModule.name}\n`);
            process.exit(1);
        }
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}
