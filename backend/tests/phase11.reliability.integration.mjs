import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI =
    process.env.PHASE11_RELIABILITY_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_phase11_reliability_test";
process.env.REDIS_URL =
    process.env.PHASE11_RELIABILITY_TEST_REDIS_URL
    ?? "redis://127.0.0.1:6379/14";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Phase 11 reliability tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    organisationModule,
    requestLogModule,
    billingRollupModule,
    billingLedgerModule,
    billingRepositoryModule,
    billingServiceModule,
    billingWorkerModule,
    billingQueueModule,
    bullMqModule,
    redisModule,
    jobContractModule,
    fakeProviderModule,
    fallbackModule,
    circuitModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/organisations/organisation.model.js"),
    import("../dist/features/billing/request-log.model.js"),
    import("../dist/features/billing/billing-rollup.model.js"),
    import("../dist/features/billing/billing-job-ledger.model.js"),
    import("../dist/features/billing/billing.repository.js"),
    import("../dist/features/billing/billing.service.js"),
    import("../dist/features/billing/billing.worker.js"),
    import("../dist/features/billing/billing.queue.js"),
    import("../dist/shared/async/bullmq.js"),
    import("../dist/shared/lib/redis.js"),
    import("../dist/shared/async/job-contract.js"),
    import("../dist/features/providers/fake-provider.adapter.js"),
    import("../dist/features/providers/provider-fallback.js"),
    import("../dist/features/providers/provider-circuit-breaker.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { OrganisationModel } = organisationModule;
const { RequestLogModel } = requestLogModule;
const { BillingRollupModel } = billingRollupModule;
const { BillingJobLedgerModel } = billingLedgerModule;
const { billingRepository } = billingRepositoryModule;
const {
    appendRequestUsage,
    getUtcBillingPeriod,
    readAuthoritativeBudgetStatus,
} = billingServiceModule;
const { processRequestCompletedBillingJob } = billingWorkerModule;
const {
    connectBillingQueue,
    enqueueRequestCompletedJob,
    getBillingQueue,
} = billingQueueModule;
const {
    createManagedWorker,
    disconnectBullMq,
} = bullMqModule;
const { connectRedis, disconnectRedis } = redisModule;
const { parseRequestCompletedJob } = jobContractModule;
const { FakeProviderAdapter } = fakeProviderModule;
const {
    AllProvidersUnavailableError,
    streamWithOrderedFallback,
} = fallbackModule;
const {
    ProviderCircuitBreaker,
    ProviderCircuitOpenError,
} = circuitModule;

const noWaitPolicy = {
    maxAttempts: 2,
    baseDelayMs: 0,
    maxDelayMs: 0,
    maxJitterMs: 0,
};
const noWaitOptions = {
    retryPolicy: noWaitPolicy,
    calculateJitterMs: () => 0,
    sleep: async () => undefined,
};

let billingQueue;
let activeWorker;

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        OrganisationModel.init(),
        RequestLogModel.init(),
        BillingRollupModel.init(),
        BillingJobLedgerModel.init(),
    ]);
    await connectRedis();
    await connectBillingQueue();
    billingQueue = getBillingQueue();
    await billingQueue.obliterate({ force: true });
});

test.beforeEach(async () => {
    await activeWorker?.close();
    activeWorker = undefined;
    await billingQueue.obliterate({ force: true });
    await Promise.all([
        OrganisationModel.collection.deleteMany({}),
        RequestLogModel.collection.deleteMany({}),
        BillingRollupModel.collection.deleteMany({}),
        BillingJobLedgerModel.collection.deleteMany({}),
    ]);
});

test.after(async () => {
    await activeWorker?.close();
    await billingQueue?.obliterate({ force: true });
    await disconnectBullMq();
    await disconnectRedis();
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("provider resilience preserves pre-token fallback and post-token stickiness", async () => {
    const primary = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
        mode: "timeout",
    });
    const secondary = new FakeProviderAdapter({
        providerId: "third",
        model: "third-test-model",
        streamTokens: ["safe", " output"],
    });
    const events = [];
    const chunks = await collect(streamWithOrderedFallback(
        createProviderRequest(),
        [candidate(primary, "groq-test-model"), candidate(secondary, "third-test-model")],
        { ...noWaitOptions, recordEvent: (event) => events.push(event) },
    ));

    assert.equal(primary.getCallCount(), 2);
    assert.equal(secondary.getCallCount(), 1);
    assert.deepEqual(chunks.map((chunk) => chunk.type), ["token", "token", "done"]);
    assert.deepEqual(events.map((event) => event.type), [
        "provider.fallback_candidate_failed",
        "provider.fallback_candidate_succeeded",
    ]);

    const midStreamPrimary = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
        mode: "mid_stream_failure",
        streamTokens: ["first", "second"],
    });
    const forbiddenFallback = new FakeProviderAdapter({
        providerId: "third",
        model: "third-test-model",
    });
    const emitted = [];

    await assert.rejects(async () => {
        for await (const chunk of streamWithOrderedFallback(
            createProviderRequest(),
            [
                candidate(midStreamPrimary, "groq-test-model"),
                candidate(forbiddenFallback, "third-test-model"),
            ],
            noWaitOptions,
        )) {
            emitted.push(chunk);
        }
    }, (error) => error?.providerId === "groq" && error?.statusCode === 500);

    assert.deepEqual(emitted, [{ type: "token", text: "first" }]);
    assert.equal(forbiddenFallback.getCallCount(), 0);
});

test("provider exhaustion, abort, and OPEN to HALF_OPEN recovery stay bounded", async () => {
    const first = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
        mode: "server_error",
    });
    const second = new FakeProviderAdapter({
        providerId: "third",
        model: "third-test-model",
        mode: "server_error",
    });

    await assert.rejects(
        collect(streamWithOrderedFallback(
            createProviderRequest(),
            [candidate(first, "groq-test-model"), candidate(second, "third-test-model")],
            noWaitOptions,
        )),
        (error) => error instanceof AllProvidersUnavailableError
            && error.attempts.length === 2,
    );
    assert.equal(first.getCallCount(), 2);
    assert.equal(second.getCallCount(), 2);

    const aborted = new AbortController();
    aborted.abort();
    const abortProvider = new FakeProviderAdapter({
        providerId: "groq",
        model: "groq-test-model",
    });
    await assert.rejects(
        collect(streamWithOrderedFallback(
            createProviderRequest(aborted.signal),
            [candidate(abortProvider, "groq-test-model")],
            noWaitOptions,
        )),
        (error) => error instanceof AllProvidersUnavailableError,
    );
    assert.equal(abortProvider.getCallCount(), 0);

    const now = { value: 1_000 };
    const breaker = new ProviderCircuitBreaker({
        policy: {
            failureThreshold: 1,
            cooldownMs: 1_000,
            halfOpenMaxTrials: 1,
        },
        now: () => now.value,
    });
    await assert.rejects(breaker.execute("groq", async () => {
        throw providerFailure();
    }));
    await assert.rejects(
        breaker.execute("groq", async () => "forbidden"),
        ProviderCircuitOpenError,
    );
    now.value = 2_000;
    assert.equal(await breaker.execute("groq", async () => "recovered"), "recovered");
    assert.equal(breaker.getSnapshot("groq").state, "CLOSED");
});

test("unknown usage remains truthful without unconditionally locking future chat", async () => {
    const firstOrganisation = await createOrganisation(100_000);
    const secondOrganisation = await createOrganisation(100_000);

    await appendRequestUsage({
        requestId: randomUUID(),
        orgId: firstOrganisation.orgId,
        userId: randomUUID(),
        status: "INTERRUPTED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: process.env.GROQ_MODEL,
    });
    await appendRequestUsage({
        requestId: randomUUID(),
        orgId: secondOrganisation.orgId,
        userId: randomUUID(),
        status: "COMPLETED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: process.env.GROQ_MODEL,
        usage: { inputTokens: 9, outputTokens: 6, totalTokens: 15 },
    });

    const firstBudget = await readAuthoritativeBudgetStatus(firstOrganisation.orgId);
    const secondBudget = await readAuthoritativeBudgetStatus(secondOrganisation.orgId);

    assert.deepEqual(
        {
            usedTokens: firstBudget.usedTokens,
            reservedTokens: firstBudget.reservedTokens,
            exceeded: firstBudget.exceeded,
        },
        { usedTokens: 0, reservedTokens: 24_096, exceeded: false },
    );
    assert.equal(secondBudget.usedTokens, 15);
    assert.equal(secondBudget.reservedTokens, undefined);
    assert.equal(
        await BillingRollupModel.countDocuments({ orgId: firstOrganisation.orgId }),
        0,
    );
});

test("real BullMQ retry and worker restart preserve exactly-once billing", async () => {
    const organisation = await createOrganisation(100_000);
    const payload = createCompletedJob(organisation.orgId);
    await appendRequestUsage({
        requestId: payload.requestId,
        orgId: payload.orgId,
        userId: payload.userId,
        status: payload.status,
        policyAction: payload.policyAction,
        providerId: payload.providerId,
        model: payload.model,
        usage: payload.usage,
    });

    let aggregateAttempts = 0;
    let rollupWrites = 0;
    const repository = {
        ...billingRepository,
        async aggregatePeriodUsage(...args) {
            aggregateAttempts += 1;
            if (aggregateAttempts === 1) {
                throw new Error("transient isolated Mongo failure");
            }
            return billingRepository.aggregatePeriodUsage(...args);
        },
        async upsertRollup(input) {
            rollupWrites += 1;
            return billingRepository.upsertRollup(input);
        },
    };

    activeWorker = createBillingTestWorker(repository);
    await activeWorker.start();
    const firstJob = await enqueueRequestCompletedJob(payload);
    await waitForJobState(firstJob.id, "completed");

    assert.equal(aggregateAttempts, 2);
    assert.equal(rollupWrites, 1);
    assert.equal((await findRollup(payload.orgId)).usedTokens, 20);

    await activeWorker.close();
    activeWorker = createBillingTestWorker(repository);
    await activeWorker.start();
    const duplicateJob = await enqueueRequestCompletedJob(payload);
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(duplicateJob.id, firstJob.id);
    assert.equal(await duplicateJob.getState(), "completed");
    assert.equal(aggregateAttempts, 2);
    assert.equal(rollupWrites, 1);
    assert.equal(
        await BillingJobLedgerModel.countDocuments({
            orgId: payload.orgId,
            requestId: payload.requestId,
            state: "COMPLETED",
        }),
        1,
    );
});

function createProviderRequest(abortSignal) {
    return {
        requestId: randomUUID(),
        messages: [{ role: "user", content: "safe reliability prompt" }],
        maxOutputTokens: 64,
        ...(abortSignal === undefined ? {} : { abortSignal }),
    };
}

function candidate(adapter, model) {
    return { adapter, model };
}

async function collect(iterable) {
    const values = [];
    for await (const value of iterable) {
        values.push(value);
    }
    return values;
}

function providerFailure() {
    return {
        isProviderError: true,
        category: "unavailable",
        providerId: "groq",
        message: "Provider unavailable.",
        retryable: true,
        statusCode: 503,
    };
}

async function createOrganisation(monthlyTokenBudget) {
    const suffix = randomUUID();
    return OrganisationModel.create({
        name: `Phase 11 Reliability ${suffix}`,
        slug: `phase11-reliability-${suffix}`,
        status: "ACTIVE",
        monthlyTokenBudget,
        policy: { maskThreshold: 20, blockThreshold: 80 },
    });
}

function createCompletedJob(orgId) {
    return {
        schemaVersion: 1,
        jobType: "request.completed",
        requestId: randomUUID(),
        orgId,
        userId: randomUUID(),
        status: "COMPLETED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: process.env.GROQ_MODEL,
        usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
        occurredAt: new Date().toISOString(),
    };
}

function createBillingTestWorker(repository) {
    return createManagedWorker({
        queueName: billingQueue.name,
        parse: parseRequestCompletedJob,
        process: (data, context, signal) => processRequestCompletedBillingJob(
            data,
            context,
            signal,
            { repository, now: () => new Date() },
        ),
    });
}

async function waitForJobState(jobId, expectedState) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        const job = await billingQueue.getJob(jobId);
        if (job !== undefined && await job.getState() === expectedState) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for BullMQ job state ${expectedState}.`);
}

async function findRollup(orgId) {
    return BillingRollupModel.findOne({
        orgId,
        period: getUtcBillingPeriod(new Date()),
    }).orFail();
}
