import assert from "node:assert/strict";
import test from "node:test";

const { deployIndexes } = await import(
    "../dist/scripts/deploy-indexes.js"
);

test("index deployment creates each declared model index without destructive sync", async () => {
    const calls = [];
    const models = ["Organisation", "User", "RequestLog"].map(
        (modelName) => ({
            modelName,
            async createIndexes() {
                calls.push(modelName);
            },
        }),
    );

    await deployIndexes(models);
    await deployIndexes(models);

    assert.deepEqual(calls, [
        "Organisation",
        "User",
        "RequestLog",
        "Organisation",
        "User",
        "RequestLog",
    ]);
});
