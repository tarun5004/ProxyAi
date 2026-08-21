import { spawnSync } from "node:child_process";

const images = [
    { name: "proxiai-frontend:phase11", requiredFile: "/app/server.js" },
    { name: "proxiai-backend:phase11", requiredFile: "/app/dist/worker.js" },
];
const forbiddenEnvironmentNames = [
    "MONGO_URI",
    "REDIS_URL",
    "JWT_ACCESS_SECRET",
    "AUTH_RATE_LIMIT_SECRET",
    "GROQ_API_KEY",
    "MESSAGE_ENCRYPTION_KEYS_JSON",
];

for (const image of images) {
    const inspection = JSON.parse(run("docker", ["inspect", image.name]))[0];
    const runtimeUser = inspection?.Config?.User;
    const runtimeEnvironment = inspection?.Config?.Env ?? [];

    if (typeof runtimeUser !== "string"
        || runtimeUser.length === 0
        || runtimeUser === "root"
        || runtimeUser === "0") {
        throw new Error(`${image.name} does not use a non-root runtime user.`);
    }
    for (const forbiddenName of forbiddenEnvironmentNames) {
        if (runtimeEnvironment.some((entry) => entry.startsWith(`${forbiddenName}=`))) {
            throw new Error(`${image.name} embeds forbidden environment ${forbiddenName}.`);
        }
    }

    run("docker", [
        "run",
        "--rm",
        "--entrypoint",
        "/usr/local/bin/node",
        image.name,
        "-e",
        `require('node:fs').accessSync('${image.requiredFile}')`,
    ]);
}

process.stdout.write(`${JSON.stringify({
    containerContract: "PASS",
    images: images.map(({ name }) => name),
    nonRoot: true,
    embeddedSecrets: false,
})}\n`);

function run(command, args) {
    const result = spawnSync(command, args, {
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
