import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI =
    process.env.BILLING_WORKER_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_billing_worker_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Billing worker tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    ledgerModule,
    rollupModule,
    requestLogModule,
    repositoryModule,
    serviceModule,
    workerModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/billing/billing-job-ledger.model.js"),
    import("../dist/features/billing/billing-rollup.model.js"),
    import("../dist/features/billing/request-log.model.js"),
    import("../dist/features/billing/billing.repository.js"),
    import("../dist/features/billing/billing.service.js"),
    import("../dist/features/billing/billing.worker.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { BillingJobLedgerModel } = ledgerModule;
const { BillingRollupModel } = rollupModule;
const { RequestLogModel } = requestLogModule;
const { billingRepository } = repositoryModule;
const { appendRequestUsage, getUtcBillingPeriod } = serviceModule;
const { processRequestCompletedBillingJob } = workerModule;

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        BillingJobLedgerModel.init(),
        BillingRollupModel.init(),
        RequestLogModel.init(),
    ]);
});

test.beforeEach(async () => {
    await Promise.all([
        BillingJobLedgerModel.collection.deleteMany({}),
        BillingRollupModel.collection.deleteMany({}),
        RequestLogModel.collection.deleteMany({}),
    ]);
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("same completed job produces one deterministic billing effect", async () => {
    const job = await createKnownUsageJob(40, 10);
    const runtime = createRuntime();

    const first = await processRequestCompletedBillingJob(
        job,
        jobContext(0),
        undefined,
        runtime.dependencies,
    );
    const duplicate = await processRequestCompletedBillingJob(
        job,
        jobContext(0),
        undefined,
        runtime.dependencies,
    );
    const rollup = await findRollup(job.orgId);

    assert.equal(first, "APPLIED");
    assert.equal(duplicate, "SKIPPED_COMPLETED");
    assert.equal(runtime.upsertCount, 1);
    assert.equal(rollup.usedTokens, 50);
    assert.equal(rollup.sourceRequestCount, 1);
});

test("concurrent duplicate jobs cannot double count", async () => {
    const job = await createKnownUsageJob(25, 15);
    const runtime = createRuntime({ delayRequestRead: true });
    const results = await Promise.all([
        processRequestCompletedBillingJob(
            job,
            jobContext(0),
            undefined,
            runtime.dependencies,
        ),
        processRequestCompletedBillingJob(
            job,
            jobContext(0),
            undefined,
            runtime.dependencies,
        ),
    ]);
    const rollup = await findRollup(job.orgId);

    assert.equal(results.includes("APPLIED"), true);
    assert.equal(
        results.some((result) => result.startsWith("SKIPPED_")),
        true,
    );
    assert.equal(runtime.upsertCount, 1);
    assert.equal(rollup.usedTokens, 40);
});

test("transient failure releases the claim for bounded retry", async () => {
    const job = await createKnownUsageJob(9, 6);
    const runtime = createRuntime({ failAggregationOnce: true });

    await assert.rejects(
        processRequestCompletedBillingJob(
            job,
            jobContext(0),
            undefined,
            runtime.dependencies,
        ),
        /Billing job processing failed/,
    );
    assert.equal(await BillingJobLedgerModel.countDocuments({}), 0);

    const retried = await processRequestCompletedBillingJob(
        job,
        jobContext(1),
        undefined,
        runtime.dependencies,
    );

    assert.equal(retried, "APPLIED");
    assert.equal(runtime.upsertCount, 1);
    assert.equal((await findRollup(job.orgId)).usedTokens, 15);
});

test("unknown provider usage records a terminal outcome without zero rollup", async () => {
    const job = createJob();

    await appendRequestUsage({
        requestId: job.requestId,
        orgId: job.orgId,
        userId: job.userId,
        providerId: job.providerId,
        model: job.model,
    });

    const result = await processRequestCompletedBillingJob(
        job,
        jobContext(0),
    );
    const ledger = await BillingJobLedgerModel.findOne({
        orgId: job.orgId,
        requestId: job.requestId,
        jobType: job.jobType,
    }).orFail();

    assert.equal(result, "USAGE_UNAVAILABLE");
    assert.equal(ledger.state, "COMPLETED");
    assert.equal(ledger.outcome, "USAGE_UNAVAILABLE");
    assert.equal(await BillingRollupModel.countDocuments({}), 0);
});

async function createKnownUsageJob(inputTokens, outputTokens) {
    const job = createJob();

    await appendRequestUsage({
        requestId: job.requestId,
        orgId: job.orgId,
        userId: job.userId,
        providerId: job.providerId,
        model: job.model,
        usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
        },
    });

    return job;
}

function createJob() {
    return {
        schemaVersion: 1,
        jobType: "request.completed",
        requestId: randomUUID(),
        orgId: randomUUID(),
        userId: randomUUID(),
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        occurredAt: new Date().toISOString(),
    };
}

function jobContext(attemptsMade) {
    return {
        jobId: randomUUID(),
        attemptsMade,
    };
}

function createRuntime({
    delayRequestRead = false,
    failAggregationOnce = false,
} = {}) {
    let aggregationFailed = false;
    let upsertCount = 0;
    const repository = {
        ...billingRepository,
        async findRequestUsage(...args) {
            if (delayRequestRead) {
                await new Promise((resolve) => setTimeout(resolve, 25));
            }

            return billingRepository.findRequestUsage(...args);
        },
        async aggregatePeriodUsage(...args) {
            if (failAggregationOnce && !aggregationFailed) {
                aggregationFailed = true;
                throw new Error("Temporary MongoDB failure");
            }

            return billingRepository.aggregatePeriodUsage(...args);
        },
        async upsertRollup(input) {
            upsertCount += 1;
            return billingRepository.upsertRollup(input);
        },
    };

    return {
        dependencies: {
            repository,
            now: () => new Date(),
        },
        get upsertCount() {
            return upsertCount;
        },
    };
}

async function findRollup(orgId) {
    return BillingRollupModel.findOne({
        orgId,
        period: getUtcBillingPeriod(new Date()),
    }).orFail();
}
