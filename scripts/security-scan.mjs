import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
    const result = spawnSync("git", args, {
        cwd: rootDirectory,
        encoding: "utf8",
    });
    if (result.status !== 0) {
        throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed.`);
    }
    return result.stdout;
}

const trackedFiles = git(["ls-files"]).split(/\r?\n/u).filter(Boolean);
const forbiddenTrackedFiles = trackedFiles.filter((path) => {
    const fileName = path.split("/").at(-1);
    const isRuntimeEnvironmentFile = /^\.env(?:\.|$)/u.test(fileName ?? "")
        && fileName !== ".env.example";
    return isRuntimeEnvironmentFile || /(^|\/)coverage\//u.test(path);
});

if (forbiddenTrackedFiles.length > 0) {
    throw new Error(`Forbidden release artifacts are tracked: ${forbiddenTrackedFiles.join(", ")}`);
}

const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: rootDirectory,
    encoding: "utf8",
});
if (diffCheck.status !== 0) {
    process.stderr.write(diffCheck.stdout);
    process.stderr.write(diffCheck.stderr);
    process.exit(diffCheck.status ?? 1);
}

process.stdout.write("Security release scan passed: no tracked env/coverage artifacts and diff is clean.\n");
