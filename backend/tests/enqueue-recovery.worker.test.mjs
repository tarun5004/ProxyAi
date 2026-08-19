import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI =
    process.env.ENQUEUE_RECOVERY_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_enqueue_recovery_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379/15";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Enqueue recovery tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    organisationModule,
    requestLogModule,
    billingServiceModule,
    billingLedgerModule,
    analyticsLedgerModule,
    recoveryModelModule,
    recoveryRepositoryModule,
    recoveryServiceModule,
    billingQueueModule,
    analyticsQueueModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/organisations/organisation.model.js"),
    import("../dist/features/billing/request-log.model.js"),
    import("../dist/features/billing/billing.service.js"),
    import("../dist/features/billing/billing-job-ledger.model.js"),
    import("../dist/features/analytics/analytics-job-ledger.model.js"),
    import("../dist/features/recovery/enqueue-recovery.model.js"),
    import("../dist/features/recovery/enqueue-recovery.repository.js"),
    import("../dist/features/recovery/enqueue-recovery.service.js"),
    import("../dist/features/billing/billing.queue.js"),
    import("../dist/features/analytics/analytics.queue.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { OrganisationModel } = organisationModule;
const { RequestLogModel } = requestLogModule;
const { appendRequestUsage } = billingServiceModule;
const { BillingJobLedgerModel } = billingLedgerModule;
const { AnalyticsJobLedgerModel } = analyticsLedgerModule;
const { EnqueueRecoveryModel } = recoveryModelModule;
const { enqueueRecoveryRepository } = recoveryRepositoryModule;
const {
    recordFailedEnqueue,
    runEnqueueRecoveryScan,
} = recoveryServiceModule;
const { createBillingJobId } = billingQueueModule;
const { createAnalyticsJobId } = analyticsQueueModule;

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        OrganisationModel.init(),
        RequestLogModel.init(),
        BillingJobLedgerModel.init(),
        AnalyticsJobLedgerModel.init(),
        EnqueueRecoveryModel.init(),
    ]);
});

test.beforeEach(async () => {
    await Promise.all([
        OrganisationModel.collection.deleteMany({}),
        RequestLogModel.collection.deleteMany({}),
        BillingJobLedgerModel.collection.deleteMany({}),
        AnalyticsJobLedgerModel.collection.deleteMany({}),
        EnqueueRecoveryModel.collection.deleteMany({}),
    ]);
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("enqueue failure creates a durable tenant-scoped recovery record", async () => {
    const source = await createCompletedRequestLog();

    await recordFailedEnqueue({
        orgId: source.orgId,
        requestId: source.requestId,
        queueName: "billing-queue",
        jobType: "request.completed",
    });

    const recovery = await EnqueueRecoveryModel.findOne({
        orgId: source.orgId,
        requestId: source.requestId,
        queueName: "billing-queue",
        jobType: "request.completed",
    }).lean();
    const requestLog = await RequestLogModel.findOne({
        orgId: source.orgId,
        requestId: source.requestId,
    }).lean();

    assert.equal(recovery?.state, "PENDING");
    assert.equal(recovery?.attemptCount, 0);
    assert.equal(recovery?.errorCategory, "ENQUEUE_UNAVAILABLE");
    assert.equal(requestLog?.totalTokens, 20);
});

test("concurrent scans re-enqueue deterministic billing and analytics jobs once", async () => {
    const source = await createCompletedRequestLog();
    const queuedJobIds = new Set();
    const enqueueCalls = [];
    const dependencies = createDependencies({
        async readQueueJobState(record) {
            return queuedJobIds.has(jobIdFor(record)) ? "waiting" : "missing";
        },
        async enqueue(record) {
            const jobId = jobIdFor(record);
            queuedJobIds.add(jobId);
            enqueueCalls.push(jobId);
        },
    });

    await Promise.all([
        runEnqueueRecoveryScan(dependencies),
        runEnqueueRecoveryScan(dependencies),
    ]);

    assert.deepEqual(
        new Set(enqueueCalls),
        new Set([
            createBillingJobId(source.requestId),
            createAnalyticsJobId("request.completed", source.requestId),
        ]),
    );
    assert.equal(enqueueCalls.length, 2);
});

test("completed business ledgers prevent duplicate billing and analytics effects", async () => {
    const source = await createCompletedRequestLog();
    const completedAt = new Date();

    await Promise.all([
        BillingJobLedgerModel.create({
            orgId: source.orgId,
            requestId: source.requestId,
            jobType: "request.completed",
            state: "COMPLETED",
            processingStartedAt: completedAt,
            completedAt,
            outcome: "APPLIED",
        }),
        AnalyticsJobLedgerModel.create({
            orgId: source.orgId,
            requestId: source.requestId,
            jobType: "request.completed",
            state: "COMPLETED",
            processingStartedAt: completedAt,
            completedAt,
        }),
    ]);
    let enqueueCount = 0;

    await runEnqueueRecoveryScan(createDependencies({
        async enqueue() {
            enqueueCount += 1;
        },
    }));

    const records = await EnqueueRecoveryModel.find({
        orgId: source.orgId,
        requestId: source.requestId,
    }).lean();

    assert.equal(enqueueCount, 0);
    assert.equal(records.length, 2);
    assert.equal(records.every((record) => record.state === "COMPLETED"), true);
});

test("bounded enqueue recovery becomes FAILED after three attempts", async () => {
    const source = await createBlockedRequestLog();
    let now = new Date("2026-08-19T00:00:00.000Z");
    const dependencies = createDependencies({
        now: () => now,
        async enqueue() {
            throw new Error("Queue unavailable");
        },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await runEnqueueRecoveryScan(dependencies);
        now = new Date(now.getTime() + 60_000);
    }

    const record = await EnqueueRecoveryModel.findOne({
        orgId: source.orgId,
        requestId: source.requestId,
        queueName: "analytics-queue",
        jobType: "request.blocked",
    }).lean();

    assert.equal(record?.state, "FAILED");
    assert.equal(record?.attemptCount, 3);
    assert.equal(record?.errorCategory, "ENQUEUE_UNAVAILABLE");
});

function createDependencies(overrides = {}) {
    return {
        repository: enqueueRecoveryRepository,
        now: () => new Date(),
        async readQueueJobState() {
            return "missing";
        },
        async enqueue() {},
        ...overrides,
    };
}

async function createCompletedRequestLog() {
    const organisation = await createOrganisation();
    const requestId = randomUUID();
    const userId = randomUUID();

    await appendRequestUsage({
        requestId,
        orgId: organisation.orgId,
        userId,
        status: "COMPLETED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        usage: {
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
        },
    });

    return { requestId, orgId: organisation.orgId, userId };
}

async function createBlockedRequestLog() {
    const organisation = await createOrganisation();
    const requestId = randomUUID();
    const userId = randomUUID();

    await appendRequestUsage({
        requestId,
        orgId: organisation.orgId,
        userId,
        status: "BLOCKED",
        policyAction: "BLOCK",
    });

    return { requestId, orgId: organisation.orgId, userId };
}

async function createOrganisation() {
    return OrganisationModel.create({
        name: "Recovery Test Organisation",
        slug: `recovery-${randomUUID()}`,
        status: "ACTIVE",
        monthlyTokenBudget: 100_000,
        policy: {
            maskThreshold: 20,
            blockThreshold: 80,
        },
    });
}

function jobIdFor(record) {
    return record.queueName === "billing-queue"
        ? createBillingJobId(record.requestId)
        : createAnalyticsJobId(record.jobType, record.requestId);
}
