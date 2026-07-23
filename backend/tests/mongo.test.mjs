import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const safeEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    PORT: "8080",
    FRONTEND_ORIGIN: "http://localhost:3000",
    MONGO_URI: "mongodb://user:SENTINEL_MONGO_PASSWORD@localhost/proxiai-test",
    REDIS_URL: "redis://localhost:6379",
};

function runModuleScript(script) {
    return spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", script],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: safeEnvironment,
        },
    );
}

test("MongoDB readiness is false before connection", () => {
    const result = runModuleScript(`
        import { isMongoReady } from "./dist/shared/lib/mongo.js";
        process.stdout.write(JSON.stringify({ ready: isMongoReady() }));
    `);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
        ready: false,
    });
});

test("MongoDB connection uses a bounded timeout and logs failure safely", () => {
    const result = runModuleScript(`
        import mongoose from "mongoose";

        let receivedTimeout;
        mongoose.connect = async (_uri, options) => {
            receivedTimeout = options.serverSelectionTimeoutMS;
            throw new Error("SENTINEL_MONGOOSE_ERROR");
        };

        const {
            connectMongo,
            isMongoReady,
            MONGO_SERVER_SELECTION_TIMEOUT_MS,
        } = await import("./dist/shared/lib/mongo.js");

        try {
            await connectMongo();
        } catch {
            console.log("RESULT:" + JSON.stringify({
                expectedTimeout: MONGO_SERVER_SELECTION_TIMEOUT_MS,
                ready: isMongoReady(),
                receivedTimeout,
            }));
        }
    `);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("SENTINEL_MONGO_PASSWORD"), false);
    assert.equal(result.stdout.includes("SENTINEL_MONGOOSE_ERROR"), false);

    const lines = result.stdout.trim().split(/\r?\n/);
    const resultLine = lines.find((line) => line.startsWith("RESULT:"));
    assert.notEqual(resultLine, undefined);
    const resultData = JSON.parse(resultLine.slice("RESULT:".length));
    const logEntries = lines
        .filter((line) => !line.startsWith("RESULT:"))
        .map((line) => JSON.parse(line));

    assert.equal(resultData.receivedTimeout, resultData.expectedTimeout);
    assert.equal(resultData.ready, false);
    assert.equal(
        logEntries.some(
            (entry) => entry.event === "mongodb.connection.failed"
                && entry.errorCode === "MONGODB_CONNECTION_FAILED",
        ),
        true,
    );
});
