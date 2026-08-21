import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";

const backendDirectory = fileURLToPath(new URL("../backend/", import.meta.url));

const suffix = `${process.pid}-${Date.now()}`;
const mongoContainer = `proxiai-phase11-mongo-${suffix}`;
const redisContainer = `proxiai-phase11-redis-${suffix}`;
const mongoPort = await reservePort();
const redisPort = await reservePort();

try {
    await run("docker", [
        "run",
        "--detach",
        "--rm",
        "--name",
        mongoContainer,
        "--publish",
        `127.0.0.1:${mongoPort}:${mongoPort}`,
        "mongo:8.0.12",
        "--replSet",
        "rs0",
        "--bind_ip_all",
        "--port",
        String(mongoPort),
    ]);
    await run("docker", [
        "run",
        "--detach",
        "--rm",
        "--name",
        redisContainer,
        "--publish",
        `127.0.0.1:${redisPort}:6379`,
        "redis:7.4.2-bookworm",
        "redis-server",
        "--save",
        "",
        "--appendonly",
        "no",
    ]);

    await waitFor(async () => (await run(
        "docker",
        [
            "exec",
            mongoContainer,
            "mongosh",
            "--quiet",
            "--port",
            String(mongoPort),
            "--eval",
            "db.adminCommand({ping:1}).ok",
        ],
        { quiet: true, allowFailure: true },
    )).output.trim() === "1", "MongoDB startup");

    await run("docker", [
        "exec",
        mongoContainer,
        "mongosh",
        "--quiet",
        "--port",
        String(mongoPort),
        "--eval",
        `rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:${mongoPort}'}]}).ok`,
    ]);
    await waitFor(async () => (await run(
        "docker",
        [
            "exec",
            mongoContainer,
            "mongosh",
            "--quiet",
            "--port",
            String(mongoPort),
            "--eval",
            "db.hello().isWritablePrimary",
        ],
        { quiet: true, allowFailure: true },
    )).output.trim() === "true", "MongoDB replica-set election");
    await waitFor(async () => (await run(
        "docker",
        ["exec", redisContainer, "redis-cli", "ping"],
        { quiet: true, allowFailure: true },
    )).output.trim() === "PONG", "Redis startup");

    const environment = createIntegrationEnvironment(mongoPort, redisPort);
    const testCommand = process.platform === "win32"
        ? (process.env.ComSpec ?? "cmd.exe")
        : "npm";
    const testArguments = process.platform === "win32"
        ? ["/d", "/s", "/c", "npm run test:integration"]
        : ["run", "test:integration"];
    const result = await run(
        testCommand,
        testArguments,
        {
            cwd: backendDirectory,
            env: environment,
            capture: true,
        },
    );

    if (!/# fail 0\b/u.test(result.output)
        || !/# skipped 0\b/u.test(result.output)) {
        throw new Error("Phase 11 integration must finish with zero failures and zero skips.");
    }

    process.stdout.write(`${JSON.stringify({
        phase: 11,
        integration: "PASS",
        mongo: "replica-set",
        redis: "isolated",
        bullmq: "isolated",
    })}\n`);
} finally {
    await run(
        "docker",
        ["rm", "--force", mongoContainer, redisContainer],
        { quiet: true, allowFailure: true },
    );
}

function createIntegrationEnvironment(mongoPortValue, redisPortValue) {
    const environment = {
        ...process.env,
        CI: "true",
        MONGO_URI: mongoUri(mongoPortValue, "proxiai_phase11_default_test"),
        REDIS_URL: `redis://127.0.0.1:${redisPortValue}/0`,
        LOGIN_TEST_REDIS_URL: `redis://127.0.0.1:${redisPortValue}/15`,
        PHASE11_RELIABILITY_TEST_REDIS_URL: `redis://127.0.0.1:${redisPortValue}/14`,
    };
    const mongoVariables = [
        "ADMIN_TEST_MONGO_URI",
        "BILLING_ACCOUNTING_TEST_MONGO_URI",
        "CONVERSATION_QUERY_TEST_MONGO_URI",
        "CONVERSATION_TITLE_TEST_MONGO_URI",
        "LOGIN_TEST_MONGO_URI",
        "MESSAGE_QUERY_TEST_MONGO_URI",
        "ORGANISATION_TEST_MONGO_URI",
        "PHASE11_A4_TEST_MONGO_URI",
        "PHASE11_API_TEST_MONGO_URI",
        "PHASE11_AUTH_TEST_MONGO_URI",
        "PHASE11_RELIABILITY_TEST_MONGO_URI",
        "PHASE11_TENANT_TEST_MONGO_URI",
        "PHASE9_MESSAGE_TEST_MONGO_URI",
        "PHASE9_TEST_MONGO_URI",
        "REFRESH_TEST_MONGO_URI",
        "USER_TEAM_TEST_MONGO_URI",
    ];

    for (const variable of mongoVariables) {
        const databaseName = `proxiai_${variable.toLowerCase().replace(/_mongo_uri$/u, "")}_test`;
        environment[variable] = mongoUri(mongoPortValue, databaseName);
    }

    return environment;
}

function mongoUri(port, databaseName) {
    return `mongodb://127.0.0.1:${port}/${databaseName}?replicaSet=rs0`;
}

async function reservePort() {
    return new Promise((resolvePort, reject) => {
        const server = net.createServer();
        server.unref();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();

            if (address === null || typeof address === "string") {
                server.close();
                reject(new Error("Unable to reserve an integration port."));
                return;
            }

            server.close((error) => {
                if (error) reject(error);
                else resolvePort(address.port);
            });
        });
    });
}

async function waitFor(probe, label) {
    const deadline = Date.now() + 120_000;

    while (Date.now() < deadline) {
        if (await probe()) {
            return;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    }

    throw new Error(`${label} timed out.`);
}

function run(command, args, options = {}) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env ?? process.env,
            stdio: options.quiet || options.capture
                ? ["ignore", "pipe", "pipe"]
                : "inherit",
            windowsHide: true,
        });
        let output = "";

        child.stdout?.on("data", (chunk) => {
            const text = chunk.toString();
            output += text;
            if (options.capture) process.stdout.write(text);
        });
        child.stderr?.on("data", (chunk) => {
            const text = chunk.toString();
            output += text;
            if (options.capture) process.stderr.write(text);
        });
        child.once("error", reject);
        child.once("exit", (code) => {
            if (code === 0 || options.allowFailure) {
                resolveRun({ code: code ?? 1, output });
                return;
            }
            reject(new Error(`${command} ${args.join(" ")} failed with code ${code}.`));
        });
    });
}
