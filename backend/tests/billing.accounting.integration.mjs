import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI =
    process.env.BILLING_ACCOUNTING_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_billing_accounting_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Billing integration tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    organisationModule,
    requestLogModule,
    billingRollupModule,
    billingServiceModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/organisations/organisation.model.js"),
    import("../dist/features/billing/request-log.model.js"),
    import("../dist/features/billing/billing-rollup.model.js"),
    import("../dist/features/billing/billing.service.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { OrganisationModel } = organisationModule;
const { RequestLogModel } = requestLogModule;
const { BillingRollupModel } = billingRollupModule;
const {
    appendRequestUsage,
    getUtcBillingPeriod,
    readAuthoritativeBudgetStatus,
} = billingServiceModule;

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        OrganisationModel.init(),
        RequestLogModel.init(),
        BillingRollupModel.init(),
    ]);
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("persisted known usage produces the authoritative budget status", async () => {
    const organisation = await createOrganisation(1_000);
    const userId = randomUUID();

    await appendKnownUsage(organisation.orgId, userId, 120, 80);
    await appendKnownUsage(organisation.orgId, userId, 30, 20);

    const status = await readAuthoritativeBudgetStatus(organisation.orgId);
    const rollup = await BillingRollupModel.findOne({
        orgId: organisation.orgId,
        period: getUtcBillingPeriod(new Date()),
    }).orFail();

    assert.deepEqual(status, {
        monthlyBudgetTokens: 1_000,
        usedTokens: 250,
        remainingTokens: 750,
        remainingPercent: 75,
        exceeded: false,
    });
    assert.equal(rollup.usedTokens, 250);
    assert.equal(rollup.sourceRequestCount, 2);
});

test("usage equal to the monthly threshold is exceeded", async () => {
    const organisation = await createOrganisation(200);

    await appendKnownUsage(
        organisation.orgId,
        randomUUID(),
        125,
        75,
    );

    const status = await readAuthoritativeBudgetStatus(organisation.orgId);

    assert.equal(status.usedTokens, 200);
    assert.equal(status.remainingTokens, 0);
    assert.equal(status.exceeded, true);
});

test("budget aggregation is isolated by trusted organisation ID", async () => {
    const firstOrganisation = await createOrganisation(500);
    const secondOrganisation = await createOrganisation(500);

    await appendKnownUsage(
        firstOrganisation.orgId,
        randomUUID(),
        10,
        15,
    );
    await appendKnownUsage(
        secondOrganisation.orgId,
        randomUUID(),
        200,
        250,
    );

    const firstStatus = await readAuthoritativeBudgetStatus(
        firstOrganisation.orgId,
    );

    assert.equal(firstStatus.usedTokens, 25);
    assert.equal(firstStatus.exceeded, false);
});

test("unknown provider usage reserves liability without tenant lockout", async () => {
    const organisation = await createOrganisation(100_000);

    await appendRequestUsage({
        requestId: randomUUID(),
        orgId: organisation.orgId,
        userId: randomUUID(),
        status: "INTERRUPTED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: process.env.GROQ_MODEL,
    });

    const status = await readAuthoritativeBudgetStatus(organisation.orgId);

    assert.equal(status.usedTokens, 0);
    assert.equal(status.reservedTokens, 24_096);
    assert.equal(status.budgetedTokens, 24_096);
    assert.equal(status.exceeded, false);
    assert.equal(
        await BillingRollupModel.countDocuments({
            orgId: organisation.orgId,
        }),
        0,
    );
});

test("unknown usage for unsupported model remains fail closed", async () => {
    const organisation = await createOrganisation(100_000);

    await appendRequestUsage({
        requestId: randomUUID(),
        orgId: organisation.orgId,
        userId: randomUUID(),
        status: "FAILED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: "retired-model",
    });

    await assert.rejects(
        readAuthoritativeBudgetStatus(organisation.orgId),
        (error) => error?.statusCode === 503
            && error?.code === "BUDGET_ACCOUNTING_UNAVAILABLE",
    );
});

async function createOrganisation(monthlyTokenBudget) {
    const suffix = randomUUID();

    return OrganisationModel.create({
        name: `Billing Organisation ${suffix}`,
        slug: `billing-${suffix}`,
        status: "ACTIVE",
        monthlyTokenBudget,
        policy: {
            maskThreshold: 20,
            blockThreshold: 60,
        },
    });
}

async function appendKnownUsage(
    orgId,
    userId,
    inputTokens,
    outputTokens,
) {
    return appendRequestUsage({
        requestId: randomUUID(),
        orgId,
        userId,
        status: "COMPLETED",
        policyAction: "ALLOW",
        providerId: "groq",
        model: "test-model",
        usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
        },
    });
}
