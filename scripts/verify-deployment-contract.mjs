import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dockerfiles = ["frontend/Dockerfile", "backend/Dockerfile"];

for (const path of dockerfiles) {
    const contents = await readFile(resolve(rootDirectory, path), "utf8");

    if (!/^USER\s+(?!root\b|0\b)\S+/imu.test(contents)) {
        throw new Error(`${path} must declare a non-root runtime user.`);
    }
    if (/COPY\s+.*\.env/iu.test(contents)) {
        throw new Error(`${path} must not copy environment files.`);
    }
    if (!/^FROM\s+\S+\s+AS\s+\S+/imu.test(contents)) {
        throw new Error(`${path} must remain a multi-stage build.`);
    }
}

const trackedScripts = run("git", ["ls-files", "deploy"])
    .trim()
    .split(/\r?\n/u)
    .filter((path) => path.endsWith(".ps1") || path.endsWith(".sh"));
const powershellScripts = trackedScripts.filter((path) => path.endsWith(".ps1"));
const shellScripts = trackedScripts.filter((path) => path.endsWith(".sh"));
const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";

for (const path of powershellScripts) {
    const absolutePath = resolve(rootDirectory, path).replaceAll("'", "''");
    run(powershell, [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('${absolutePath}', [ref]$null, [ref]$errors) > $null; if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }`,
    ]);
}

run(powershell, [
    "-NoProfile",
    "-NonInteractive",
    "-File",
    resolve(rootDirectory, "deploy/aws/tests/demo-power-common.test.ps1"),
]);

const bash = findBash();

for (const path of shellScripts) {
    run(bash, ["-n", resolve(rootDirectory, path)]);
}

run(process.execPath, [
    "--test",
    "--test-timeout=30000",
    "tests/deploy-indexes.test.mjs",
], resolve(rootDirectory, "backend"));

process.stdout.write(`${JSON.stringify({
    deploymentContract: "PASS",
    dockerfiles: dockerfiles.length,
    powershellScripts: powershellScripts.length,
    shellScripts: shellScripts.length,
    indexCheck: "PASS",
})}\n`);

function findBash() {
    if (process.platform !== "win32") {
        return "bash";
    }

    const candidates = [
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    ];
    const candidate = candidates.find(existsSync);

    if (candidate === undefined) {
        throw new Error("Git Bash is required for deployment shell syntax verification.");
    }

    return candidate;
}

function run(command, args, cwd = rootDirectory) {
    const result = spawnSync(command, args, {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
    });

    if (result.status !== 0) {
        process.stderr.write(result.stdout ?? "");
        process.stderr.write(result.stderr ?? "");
        throw new Error(`${command} ${args.join(" ")} failed.`);
    }

    return result.stdout ?? "";
}
