import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import express from "express";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [
    { AppError },
    { requirePermission },
    { createChatStreamHandler },
    { processPiiPromptImmutably },
    { createPolicyDecisionEvent },
    { streamWithOrderedFallback },
    { globalErrorHandler },
    { requestIdMiddleware },
] = await Promise.all([
    import("../dist/shared/errors/app-error.js"),
    import("../dist/features/auth/authorization.middleware.js"),
    import("../dist/features/chat/chat.controller.js"),
    import("../dist/features/pii/pii-prompt-processor.js"),
    import("../dist/features/policy/policy-events.js"),
    import("../dist/features/providers/provider-fallback.js"),
    import("../dist/shared/middleware/error.middleware.js"),
    import("../dist/shared/middleware/request-id.middleware.js"),
]);

const trustedOrgId = randomUUID();
const trustedUserId = randomUUID();
const conversationId = randomUUID();

function createRuntime({
    policy = { maskThreshold: 20, blockThreshold: 60 },
    budgetError,
    ownershipError,
    usageError,
} = {}) {
    const order = [];
    const providerRequests = [];
    const usageRecords = [];
    const policyEvents = [];
    const reservationEvents = [];
    let providerCalls = 0;
    const adapter = {
        providerId: "groq",
        async complete() {
            throw new Error("Non-stream completion is not used.");
        },
        async *stream(request) {
            providerCalls += 1;
            providerRequests.push(request);
            yield { type: "token", text: "Safe streamed output" };
            yield {
                type: "done",
                finishReason: "stop",
                usage: {
                    inputTokens: 12,
                    outputTokens: 8,
                    totalTokens: 20,
                },
                latencyMs: 25,
            };
        },
        async checkHealth() {
            return {
                providerId: "groq",
                status: "healthy",
                checkedAt: new Date(),
            };
        },
        getCapabilities() {
            return {
                providerId: "groq",
                supportedModels: ["test-model"],
                supportsStreaming: true,
                supportsNonStreaming: true,
                maxInputTokens: 20_000,
                maxOutputTokens: 256,
            };
        },
    };
    const idempotency = {
        async reserve() {
            order.push("idempotency");

            return {
                markProviderExecutionStarted() {
                    reservationEvents.push("provider-started");
                },
                async markCompleted() {
                    reservationEvents.push("completed");
                },
                async releaseBeforeExecution() {
                    reservationEvents.push("released");
                },
            };
        },
    };
    const controls = {
        async consumeRateLimit() {
            order.push("rate-limit");
        },
    };
    const dependencies = {
        async assertConversationOwner() {
            order.push("ownership");

            if (ownershipError) {
                throw ownershipError;
            }
        },
        async loadOrganisationContext() {
            order.push("organisation");

            return {
                plan: "FREE",
                policy,
                autoRoutingEnabled: false,
            };
        },
        controls,
        idempotency,
        async readBudgetStatus() {
            order.push("budget");

            if (budgetError) {
                throw budgetError;
            }

            return availableBudget();
        },
        processPrompt(request) {
            order.push("pii");
            return processPiiPromptImmutably(request);
        },
        candidates: [{ adapter, model: "test-model" }],
        streamProvider: streamWithOrderedFallback,
        async appendUsage(input) {
            if (usageError) {
                throw usageError;
            }

            usageRecords.push(input);
            return input;
        },
        async reconcileBudget() {
            order.push("reconcile-budget");
            return availableBudget();
        },
        emitPolicyEvent(input) {
            const event = createPolicyDecisionEvent(input);
            policyEvents.push(event);
            return event;
        },
    };

    return {
        dependencies,
        order,
        policyEvents,
        providerRequests,
        reservationEvents,
        usageRecords,
        get providerCalls() {
            return providerCalls;
        },
    };
}

function createTestApp(runtime) {
    const testApp = express();

    testApp.use(requestIdMiddleware);
    testApp.use(express.json());
    testApp.post(
        "/api/v1/chat/stream",
        (request, _response, next) => {
            request.auth = {
                orgId: trustedOrgId,
                userId: trustedUserId,
                role: "EMPLOYEE",
                permissions: ["chat:send"],
                sessionId: randomUUID(),
            };
            next();
        },
        requirePermission("chat:send"),
        createChatStreamHandler(runtime.dependencies),
    );
    testApp.use(globalErrorHandler);

    return testApp;
}

async function postChat(runtime, prompt) {
    const application = createTestApp(runtime);
    const server = application.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    assert.notEqual(address, null);
    assert.equal(typeof address, "object");

    try {
        return await fetch(
            `http://127.0.0.1:${address.port}/api/v1/chat/stream`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                },
                body: JSON.stringify({
                    conversationId,
                    prompt,
                    clientRequestId: randomUUID(),
                    providerId: "groq",
                    routingMode: "manual",
                }),
            },
        );
    } finally {
        server.close();
        await once(server, "close");
    }
}

test("BLOCK returns JSON 403 and performs zero provider calls", async () => {
    const runtime = createRuntime({
        policy: { maskThreshold: 20, blockThreshold: 40 },
    });
    const response = await postChat(
        runtime,
        "Set api_key=gsk_abcdefghijklmnopqrstuvwxyz123456.",
    );
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error.code, "POLICY_BLOCKED");
    assert.equal(runtime.providerCalls, 0);
    assert.deepEqual(runtime.order, [
        "ownership",
        "organisation",
        "idempotency",
        "rate-limit",
        "budget",
        "pii",
    ]);
    assert.deepEqual(runtime.reservationEvents, ["completed"]);
});

test("MASK sends only the masked providerPrompt", async () => {
    const sensitiveValue = "ada@example.com";
    const runtime = createRuntime({
        policy: { maskThreshold: 10, blockThreshold: 60 },
    });
    const response = await postChat(
        runtime,
        `Email ${sensitiveValue} today.`,
    );
    const streamText = await response.text();
    const captured = JSON.stringify({
        providerRequests: runtime.providerRequests,
        policyEvents: runtime.policyEvents,
        streamText,
    });

    assert.equal(response.status, 200);
    assert.equal(runtime.providerCalls, 1);
    assert.equal(
        runtime.providerRequests[0]?.messages[0]?.content,
        "Email [EMAIL_REDACTED] today.",
    );
    assert.equal(captured.includes(sensitiveValue), false);
    assert.match(streamText, /event: policy/);
    assert.match(streamText, /"action":"ALLOW_WITH_MASK"/);
});

test("ALLOW streams output and records known provider usage", async () => {
    const runtime = createRuntime();
    const response = await postChat(runtime, "Explain adapter patterns.");
    const streamText = await response.text();

    assert.equal(response.status, 200);
    assert.match(streamText, /event: request_started/);
    assert.match(streamText, /event: routing/);
    assert.match(streamText, /event: token/);
    assert.match(streamText, /Safe streamed output/);
    assert.match(streamText, /event: done/);
    assert.equal(runtime.usageRecords.length, 1);
    assert.deepEqual(runtime.usageRecords[0]?.usage, {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
    });
    assert.equal(runtime.order.includes("reconcile-budget"), true);
    assert.deepEqual(
        runtime.reservationEvents,
        ["provider-started", "completed"],
    );
});

test("pre-provider failures release safely and post-provider accounting failure completes", async () => {
    const foreignRuntime = createRuntime({
        ownershipError: new AppError(
            404,
            "NOT_FOUND",
            "Conversation not found.",
        ),
    });
    const foreignResponse = await postChat(foreignRuntime, "Safe prompt");

    assert.equal(foreignResponse.status, 404);
    assert.equal(foreignRuntime.providerCalls, 0);
    assert.deepEqual(foreignRuntime.order, ["ownership"]);

    const budgetRuntime = createRuntime({
        budgetError: new AppError(
            503,
            "BUDGET_ACCOUNTING_UNAVAILABLE",
            "Token budget accounting is unavailable.",
        ),
    });
    const budgetResponse = await postChat(budgetRuntime, "Safe prompt");

    assert.equal(budgetResponse.status, 503);
    assert.equal(budgetRuntime.providerCalls, 0);
    assert.deepEqual(budgetRuntime.order, [
        "ownership",
        "organisation",
        "idempotency",
        "rate-limit",
        "budget",
    ]);
    assert.deepEqual(budgetRuntime.reservationEvents, ["released"]);

    const usageRuntime = createRuntime({
        usageError: new AppError(
            503,
            "BUDGET_ACCOUNTING_UNAVAILABLE",
            "Token usage could not be recorded.",
        ),
    });
    const usageResponse = await postChat(usageRuntime, "Safe prompt");
    const usageStream = await usageResponse.text();

    assert.equal(usageResponse.status, 200);
    assert.equal(usageRuntime.providerCalls, 1);
    assert.match(usageStream, /event: error/);
    assert.deepEqual(
        usageRuntime.reservationEvents,
        ["provider-started", "completed"],
    );
});

function availableBudget() {
    return {
        monthlyBudgetTokens: 10_000,
        usedTokens: 100,
        remainingTokens: 9_900,
        remainingPercent: 99,
        exceeded: false,
    };
}
