import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.MONGO_URI =
    process.env.ANOMALY_WORKER_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_anomaly_worker_test";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Anomaly worker tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    organisationModelModule,
    analyticsModelModule,
    alertModelModule,
    workerModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/organisations/organisation.model.js"),
    import("../dist/features/analytics/analytics-daily.model.js"),
    import("../dist/features/alerts/alert.model.js"),
    import("../dist/features/anomaly/anomaly.worker.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { OrganisationModel } = organisationModelModule;
const { AnalyticsDailyAggregateModel } = analyticsModelModule;
const { AlertModel } = alertModelModule;
const { processUsageUpdatedAnomalyJob } = workerModule;

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        OrganisationModel.init(),
        AnalyticsDailyAggregateModel.init(),
        AlertModel.init(),
    ]);
});

test.beforeEach(async () => {
    await Promise.all([
        OrganisationModel.collection.deleteMany({}),
        AnalyticsDailyAggregateModel.collection.deleteMany({}),
        AlertModel.collection.deleteMany({}),
    ]);
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("three active baseline days detect a greater-than-two-times anomaly", async () => {
    const scope = await createScope();
    await createBaseline(scope, [10, 20, 30]);
    await createDailyUsage(scope, {
        date: "2026-08-18",
        totalTokens: 41,
    });

    const result = await processUsageUpdatedAnomalyJob(
        createJob(scope),
        jobContext(),
    );
    const alert = await AlertModel.findOne({
        orgId: scope.orgId,
        userId: scope.userId,
        observedDay: "2026-08-18",
        type: "ANOMALY",
    }).orFail();

    assert.equal(result, "ALERT_RECORDED");
    assert.equal(alert.severity, "HIGH");
    assert.equal(alert.status, "OPEN");
    assert.equal(alert.metadata.observedTokens, 41);
    assert.equal(alert.metadata.baselineAverageTokens, 20);
    assert.equal(alert.metadata.baselineActiveDays, 3);
});

test("feature gate and minimum three-day baseline prevent detection", async () => {
    const scope = await createScope({ anomalyDetection: false });
    await createBaseline(scope, [10, 20, 30]);
    await createDailyUsage(scope, {
        date: "2026-08-18",
        totalTokens: 100,
    });

    const disabled = await processUsageUpdatedAnomalyJob(
        createJob(scope),
        jobContext(),
    );
    await OrganisationModel.updateOne(
        { orgId: scope.orgId },
        { $set: { "featureFlags.anomalyDetection": true } },
        { runValidators: true },
    );
    await AnalyticsDailyAggregateModel.deleteOne({
        orgId: scope.orgId,
        userId: scope.userId,
        date: "2026-08-11",
    });
    const insufficient = await processUsageUpdatedAnomalyJob(
        createJob(scope),
        jobContext(),
    );

    assert.equal(disabled, "SKIPPED_FEATURE_DISABLED");
    assert.equal(insufficient, "SKIPPED_INSUFFICIENT_BASELINE");
    assert.equal(await AlertModel.countDocuments({ orgId: scope.orgId }), 0);
});

test("unknown usage is excluded from baseline and unavailable current day skips", async () => {
    const scope = await createScope();
    await createBaseline(scope, [10, 20, 30]);
    await createDailyUsage(scope, {
        date: "2026-08-14",
        totalTokens: 1_000,
        unknownUsageRequestCount: 1,
    });
    await createDailyUsage(scope, {
        date: "2026-08-18",
        totalTokens: 41,
    });

    const detected = await processUsageUpdatedAnomalyJob(
        createJob(scope),
        jobContext(),
    );
    const alert = await AlertModel.findOne({
        orgId: scope.orgId,
        userId: scope.userId,
        observedDay: "2026-08-18",
    }).orFail();
    await createDailyUsage(scope, {
        date: "2026-08-19",
        totalTokens: 100,
        unknownUsageRequestCount: 1,
    });
    const currentUnknown = await processUsageUpdatedAnomalyJob(
        createJob(scope, { observedDay: "2026-08-19" }),
        jobContext(),
    );

    assert.equal(detected, "ALERT_RECORDED");
    assert.equal(alert.metadata.baselineActiveDays, 3);
    assert.equal(alert.metadata.baselineAverageTokens, 20);
    assert.equal(currentUnknown, "SKIPPED_CURRENT_USAGE_UNAVAILABLE");
    assert.equal(await AlertModel.countDocuments({ orgId: scope.orgId }), 1);
});

test("duplicate usage events create one same-day unresolved alert", async () => {
    const scope = await createScope();
    await createBaseline(scope, [10, 20, 30]);
    await createDailyUsage(scope, {
        date: "2026-08-18",
        totalTokens: 100,
    });
    const job = createJob(scope);

    const results = await Promise.all([
        processUsageUpdatedAnomalyJob(job, jobContext()),
        processUsageUpdatedAnomalyJob(job, jobContext()),
    ]);

    assert.deepEqual(results, ["ALERT_RECORDED", "ALERT_RECORDED"]);
    assert.equal(await AlertModel.countDocuments({
        orgId: scope.orgId,
        userId: scope.userId,
        observedDay: "2026-08-18",
        type: "ANOMALY",
        status: "OPEN",
    }), 1);
});

async function createScope(options = {}) {
    const orgId = randomUUID();
    const userId = randomUUID();

    await OrganisationModel.create({
        orgId,
        name: "Anomaly Test Organisation",
        slug: `anomaly-${orgId.slice(0, 8)}`,
        status: "ACTIVE",
        plan: "FREE",
        monthlyTokenBudget: 100_000,
        retention: { mode: "METADATA_ONLY" },
        policy: {
            maskThreshold: 20,
            blockThreshold: 80,
        },
        featureFlags: {
            autoRouting: false,
            teamLeadView: false,
            anomalyDetection: options.anomalyDetection ?? true,
            auditExport: false,
        },
    });

    return { orgId, userId };
}

async function createBaseline(scope, tokenTotals) {
    const dates = ["2026-08-11", "2026-08-12", "2026-08-13"];

    await Promise.all(tokenTotals.map((totalTokens, index) =>
        createDailyUsage(scope, {
            date: dates[index],
            totalTokens,
        })));
}

async function createDailyUsage(scope, input) {
    return AnalyticsDailyAggregateModel.create({
        orgId: scope.orgId,
        userId: scope.userId,
        date: input.date,
        scope: "USER",
        totalRequests: 1,
        successfulRequests: 1,
        blockedRequests: 0,
        maskedRequests: 0,
        failedRequests: 0,
        interruptedRequests: 0,
        knownUsageRequestCount: 1,
        unknownUsageRequestCount: input.unknownUsageRequestCount ?? 0,
        inputTokens: 0,
        outputTokens: input.totalTokens,
        totalTokens: input.totalTokens,
        providerModelRequestCounts: [],
    });
}

function createJob(scope, overrides = {}) {
    return {
        schemaVersion: 1,
        jobType: "usage.updated",
        requestId: randomUUID(),
        orgId: scope.orgId,
        userId: scope.userId,
        observedDay: "2026-08-18",
        occurredAt: "2026-08-18T12:00:00.000Z",
        ...overrides,
    };
}

function jobContext() {
    return {
        attemptsMade: 0,
        jobId: randomUUID(),
    };
}
