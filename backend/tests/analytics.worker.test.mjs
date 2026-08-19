import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI =
    process.env.ANALYTICS_WORKER_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_analytics_worker_test";
process.env.REDIS_URL =
    process.env.ANALYTICS_WORKER_TEST_REDIS_URL
    ?? "redis://127.0.0.1:6379/14";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Analytics worker tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    redisModule,
    bullMqModule,
    queueModule,
    dailyModelModule,
    ledgerModelModule,
    requestLogModule,
    billingServiceModule,
    workerModule,
    anomalyQueueModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/shared/lib/redis.js"),
    import("../dist/shared/async/bullmq.js"),
    import("../dist/features/analytics/analytics.queue.js"),
    import("../dist/features/analytics/analytics-daily.model.js"),
    import("../dist/features/analytics/analytics-job-ledger.model.js"),
    import("../dist/features/billing/request-log.model.js"),
    import("../dist/features/billing/billing.service.js"),
    import("../dist/features/analytics/analytics.worker.js"),
    import("../dist/features/anomaly/anomaly.queue.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { connectRedis, disconnectRedis } = redisModule;
const { disconnectBullMq } = bullMqModule;
const {
    connectAnalyticsQueue,
    enqueueAnalyticsRequestOutcomeJob,
    getAnalyticsQueue,
} = queueModule;
const { AnalyticsDailyAggregateModel } = dailyModelModule;
const { AnalyticsJobLedgerModel } = ledgerModelModule;
const { RequestLogModel } = requestLogModule;
const { appendRequestUsage } = billingServiceModule;
const { processAnalyticsRequestOutcomeJob } = workerModule;
const {
    connectAnomalyQueue,
    getAnomalyQueue,
} = anomalyQueueModule;

let analyticsQueue;
let anomalyQueue;

test.before(async () => {
    await Promise.all([connectMongo(), connectRedis()]);
    await mongoose.connection.dropDatabase();
    await Promise.all([
        AnalyticsDailyAggregateModel.init(),
        AnalyticsJobLedgerModel.init(),
        RequestLogModel.init(),
    ]);
    await Promise.all([
        connectAnalyticsQueue(),
        connectAnomalyQueue(),
    ]);
    analyticsQueue = getAnalyticsQueue();
    anomalyQueue = getAnomalyQueue();
    await Promise.all([
        analyticsQueue.obliterate({ force: true }),
        anomalyQueue.obliterate({ force: true }),
    ]);
});

test.beforeEach(async () => {
    await Promise.all([
        AnalyticsDailyAggregateModel.collection.deleteMany({}),
        AnalyticsJobLedgerModel.collection.deleteMany({}),
        RequestLogModel.collection.deleteMany({}),
        analyticsQueue.obliterate({ force: true }),
        anomalyQueue.obliterate({ force: true }),
    ]);
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectBullMq();
    await disconnectRedis();
    await disconnectMongo();
});

test("request outcomes enqueue one safe canonical analytics job", async () => {
    const job = createCompletedJob({
        usage: {
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
        },
    });
    const queued = await enqueueAnalyticsRequestOutcomeJob(job);

    assert.equal(queued.name, "request.completed");
    assert.deepEqual(queued.data, job);
    assert.equal(queued.id.includes(":"), false);
    assert.equal("prompt" in queued.data, false);
    assert.equal("response" in queued.data, false);
});

test("distinct jobs update aggregates while duplicates have no extra effect", async () => {
    const job = createCompletedJob({
        policyAction: "ALLOW_WITH_MASK",
        usage: {
            inputTokens: 25,
            outputTokens: 15,
            totalTokens: 40,
        },
    });
    const secondJob = createCompletedJob({
        orgId: job.orgId,
        userId: job.userId,
        policyAction: "ALLOW_WITH_MASK",
        usage: job.usage,
    });
    await Promise.all([appendOutcome(job), appendOutcome(secondJob)]);

    const first = await processAnalyticsRequestOutcomeJob(
        job,
        jobContext(0),
    );
    const duplicate = await processAnalyticsRequestOutcomeJob(
        job,
        jobContext(0),
    );
    const second = await processAnalyticsRequestOutcomeJob(
        secondJob,
        jobContext(0),
    );
    const aggregate = await findOrganisationAggregate(job.orgId);
    const anomalyJobs = await anomalyQueue.getJobs(["waiting"]);

    assert.equal(first, "APPLIED");
    assert.equal(duplicate, "SKIPPED_COMPLETED");
    assert.equal(second, "APPLIED");
    assert.equal(aggregate.totalRequests, 2);
    assert.equal(aggregate.successfulRequests, 2);
    assert.equal(aggregate.maskedRequests, 2);
    assert.equal(aggregate.totalTokens, 80);
    assert.equal(aggregate.providerModelRequestCounts[0].requestCount, 2);
    assert.equal(anomalyJobs.length, 2);
    const firstAnomalyJob = anomalyJobs.find(
        (queuedJob) => queuedJob.data.requestId === job.requestId,
    );
    assert.ok(firstAnomalyJob);
    assert.equal(firstAnomalyJob.id.includes(job.orgId), false);
    assert.equal(firstAnomalyJob.id.includes(job.userId), false);
    assert.equal(firstAnomalyJob.id.includes(job.requestId), false);
    assert.deepEqual(firstAnomalyJob.data, {
        schemaVersion: 1,
        jobType: "usage.updated",
        requestId: job.requestId,
        orgId: job.orgId,
        userId: job.userId,
        observedDay: job.occurredAt.slice(0, 10),
        occurredAt: job.occurredAt,
    });
});

test("blocked request increments only safe blocked analytics", async () => {
    const job = createBlockedJob();
    await appendOutcome(job);

    await processAnalyticsRequestOutcomeJob(job, jobContext(0));
    const aggregate = await findOrganisationAggregate(job.orgId);

    assert.equal(aggregate.totalRequests, 1);
    assert.equal(aggregate.blockedRequests, 1);
    assert.equal(aggregate.successfulRequests, 0);
    assert.equal(aggregate.knownUsageRequestCount, 0);
    assert.equal(aggregate.unknownUsageRequestCount, 0);
    assert.deepEqual(aggregate.providerModelRequestCounts, []);
});

test("tenant isolation preserves unknown usage without synthetic tokens", async () => {
    const unknownJob = createCompletedJob({ status: "INTERRUPTED" });
    const knownJob = createCompletedJob({
        usage: {
            inputTokens: 7,
            outputTokens: 3,
            totalTokens: 10,
        },
    });
    await Promise.all([
        appendOutcome(unknownJob),
        appendOutcome(knownJob),
    ]);

    await processAnalyticsRequestOutcomeJob(
        unknownJob,
        jobContext(0),
    );
    await processAnalyticsRequestOutcomeJob(
        knownJob,
        jobContext(0),
    );
    const unknownAggregate = await findOrganisationAggregate(
        unknownJob.orgId,
    );
    const knownAggregate = await findOrganisationAggregate(knownJob.orgId);

    assert.equal(unknownAggregate.totalRequests, 1);
    assert.equal(unknownAggregate.unknownUsageRequestCount, 1);
    assert.equal(unknownAggregate.totalTokens, 0);
    assert.equal(knownAggregate.totalRequests, 1);
    assert.equal(knownAggregate.knownUsageRequestCount, 1);
    assert.equal(knownAggregate.totalTokens, 10);
});

async function appendOutcome(job) {
    return appendRequestUsage({
        requestId: job.requestId,
        orgId: job.orgId,
        userId: job.userId,
        status: job.status,
        policyAction: job.policyAction,
        ...(job.jobType === "request.blocked"
            ? {}
            : {
                providerId: job.providerId,
                model: job.model,
                ...(job.usage === undefined ? {} : { usage: job.usage }),
            }),
    });
}

function createCompletedJob(overrides = {}) {
    return {
        schemaVersion: 1,
        jobType: "request.completed",
        requestId: randomUUID(),
        orgId: randomUUID(),
        userId: randomUUID(),
        status: "COMPLETED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        occurredAt: new Date().toISOString(),
        ...overrides,
    };
}

function createBlockedJob() {
    return {
        schemaVersion: 1,
        jobType: "request.blocked",
        requestId: randomUUID(),
        orgId: randomUUID(),
        userId: randomUUID(),
        status: "BLOCKED",
        policyAction: "BLOCK",
        occurredAt: new Date().toISOString(),
    };
}

function jobContext(attemptsMade) {
    return {
        attemptsMade,
        jobId: randomUUID(),
    };
}

function findOrganisationAggregate(orgId) {
    return AnalyticsDailyAggregateModel.findOne({
        orgId,
        scope: "ORGANISATION",
        userId: { $exists: false },
    }).orFail();
}
