import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test, { beforeEach } from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [
    { buildAuditCsv },
    { buildAuditMetadata },
    { prepareChatStream, finalizeChatStream },
    {
        createEncryptionService,
        loadEncryptionKeyring,
    },
    { processPiiPromptImmutably },
    { createPolicyDecisionEvent },
    { metricsRegistry },
] = await Promise.all([
    import("../dist/features/audit/audit.export.service.js"),
    import("../dist/features/audit/audit.metadata.js"),
    import("../dist/features/chat/chat.service.js"),
    import("../dist/shared/security/encryption.js"),
    import("../dist/features/pii/pii-prompt-processor.js"),
    import("../dist/features/policy/policy-events.js"),
    import("../dist/shared/observability/metrics.js"),
]);

beforeEach(() => {
    metricsRegistry.resetMetrics();
});

test("BLOCK keeps the raw sentinel outside provider, persistence, async, audit, and metrics", async () => {
    const sentinel = "gsk_phase11_sensitive_abcdefghijklmnopqrstuvwxyz";
    const runtime = createRuntime({
        policy: { maskThreshold: 20, blockThreshold: 40 },
    });

    await assert.rejects(
        prepare(runtime, `Use api_key=${sentinel} now.`),
        (error) => error.statusCode === 403 && error.code === "POLICY_BLOCKED",
    );

    const observableBoundary = JSON.stringify({
        auditEvents: runtime.auditEvents,
        billingJobs: runtime.billingJobs,
        analyticsJobs: runtime.analyticsJobs,
        persistedMessages: runtime.persistedMessages,
        policyEvents: runtime.policyEvents,
        reservationInputs: runtime.reservationInputs,
        usageRecords: runtime.usageRecords,
        metrics: await metricsRegistry.metrics(),
    });

    assert.equal(runtime.providerCalls, 0);
    assert.equal(runtime.persistedMessages.length, 0);
    assert.equal(runtime.billingJobs.length, 0);
    assert.equal(runtime.analyticsJobs.length, 1);
    assert.equal(observableBoundary.includes(sentinel), false);
    assert.deepEqual(runtime.reservationEvents, ["completed"]);
});

test("MASK sends only masked content while preserving the original request", async () => {
    const sentinel = "phase11-sensitive@example.test";
    const request = createRequest(`Contact ${sentinel} today.`);
    const originalSnapshot = structuredClone(request);
    const runtime = createRuntime({
        policy: { maskThreshold: 10, blockThreshold: 80 },
    });
    const prepared = await prepare(runtime, request.prompt, request);

    await finalizeChatStream(prepared, {
        status: "COMPLETED",
        usage: {
            inputTokens: 4,
            outputTokens: 6,
            totalTokens: 10,
        },
    }, runtime.dependencies);

    assert.deepEqual(request, originalSnapshot);
    assert.equal(runtime.providerCalls, 1);
    assert.equal(
        runtime.providerRequests[0]?.messages[0]?.content,
        "Contact [EMAIL_REDACTED] today.",
    );
    assert.equal(JSON.stringify({
        providerRequests: runtime.providerRequests,
        policyEvents: runtime.policyEvents,
        auditEvents: runtime.auditEvents,
        billingJobs: runtime.billingJobs,
        analyticsJobs: runtime.analyticsJobs,
        metrics: await metricsRegistry.metrics(),
    }).includes(sentinel), false);

    const allowed = createRuntime();
    const allowedPrompt = "Explain bounded security gates.";
    await prepare(allowed, allowedPrompt);
    assert.equal(
        allowed.providerRequests[0]?.messages[0]?.content,
        allowedPrompt,
    );
});

test("ProxiAI product questions bind truthful facts while ordinary provider messages stay unchanged", async () => {
    const questions = [
        "What security certifications does ProxiAI have?",
        "Does ProxiAI use HSM?",
        "Which AI providers does ProxiAI support?",
        "Does ProxiAI store all prompts and responses?",
        "Is ProxiAI SOC2 certified?",
        "Does ProxiAI support regional data residency?",
    ];

    for (const question of questions) {
        const runtime = createRuntime();

        await prepare(runtime, question);

        const messages = runtime.providerRequests[0]?.messages;
        assert.equal(messages?.length, 2, question);
        assert.equal(messages?.[0]?.role, "system");
        assert.match(messages?.[0]?.content ?? "", /Groq is the only enabled production AI provider/);
        assert.match(messages?.[0]?.content ?? "", /does not claim SOC 2/);
        assert.match(messages?.[0]?.content ?? "", /HSM.*not implemented/);
        assert.match(messages?.[0]?.content ?? "", /Regional data-residency guarantees.*not implemented/);
        assert.equal(messages?.[1]?.role, "user");
        assert.equal(messages?.[1]?.content, question);
    }

    const ordinaryPrompt = "Explain bounded security gates.";
    const ordinaryRuntime = createRuntime();

    await prepare(ordinaryRuntime, ordinaryPrompt);

    assert.deepEqual(ordinaryRuntime.providerRequests[0]?.messages, [
        { role: "user", content: ordinaryPrompt },
    ]);

    const sensitiveValue = "grounding-owner@example.test";
    const maskedRuntime = createRuntime({
        policy: { maskThreshold: 10, blockThreshold: 80 },
    });

    await prepare(
        maskedRuntime,
        `Does ProxiAI store messages for ${sensitiveValue}?`,
    );

    const maskedMessages = maskedRuntime.providerRequests[0]?.messages;
    assert.equal(maskedMessages?.length, 2);
    assert.equal(maskedMessages?.[0]?.role, "system");
    assert.equal(
        maskedMessages?.[1]?.content,
        "Does ProxiAI store messages for [EMAIL_REDACTED]?",
    );
    assert.equal(JSON.stringify(maskedMessages).includes(sensitiveValue), false);
});

test("AES-GCM rejects every untrusted context and malformed envelope without leakage", () => {
    const key = randomBytes(32).toString("base64url");
    const plaintext = "PHASE11_ENCRYPTION_SENTINEL";
    const service = createEncryptionService(loadEncryptionKeyring(
        JSON.stringify({ 1: key }),
        1,
    ));
    const context = {
        orgId: randomUUID(),
        entityType: "MESSAGE",
        entityId: randomUUID(),
        fieldName: "content",
        conversationId: randomUUID(),
        messageId: randomUUID(),
    };
    const encrypted = service.encrypt(plaintext, context);
    const invalidInputs = [
        [encrypted, { ...context, orgId: randomUUID() }],
        [encrypted, { ...context, entityId: randomUUID() }],
        [encrypted, { ...context, conversationId: randomUUID() }],
        [encrypted, { ...context, messageId: randomUUID() }],
        [{ ...encrypted, keyVersion: 2 }, context],
        [{ ...encrypted, ciphertext: "not+base64url" }, context],
        [{ ...encrypted, authTag: "AA" }, context],
    ];

    assert.equal(service.decrypt(encrypted, context), plaintext);

    for (const [payload, invalidContext] of invalidInputs) {
        assert.throws(() => service.decrypt(payload, invalidContext), (error) => {
            const serialized = JSON.stringify({
                code: error.code,
                message: error.message,
            });

            assert.match(
                error.code,
                /^(?:ENCRYPTION_UNAVAILABLE|MESSAGE_CONTENT_UNAVAILABLE)$/,
            );
            assert.equal(serialized.includes(plaintext), false);
            assert.equal(serialized.includes(key), false);
            return true;
        });
    }
});

test("audit metadata stays bounded and CSV neutralizes whitespace-prefixed formulas", () => {
    assert.throws(() => buildAuditMetadata("auth.login_failed", {
        reasonCode: "phase11-sensitive@example.test",
    }), /Invalid safe audit metadata/);
    assert.throws(() => buildAuditMetadata("user.role_changed", {
        oldRole: "EMPLOYEE",
        newRole: "ORG_ADMIN",
        prompt: "PHASE11_AUDIT_SENTINEL",
    }), /Invalid safe audit metadata/);

    const csv = buildAuditCsv([
        auditRecord("=HYPERLINK(\"https://example.test\")"),
        auditRecord(" \t=cmd|' /C calc'!A0"),
    ]);

    assert.match(csv, /"'=HYPERLINK/);
    assert.match(csv, /"' \t=cmd/);
    assert.doesNotMatch(csv, /PHASE11_AUDIT_SENTINEL/);
});

function createRuntime({
    policy = {},
} = {}) {
    const resolvedPolicy = {
        maskThreshold: 20,
        blockThreshold: 60,
        maxOutputTokensPerRequest: 256,
        ...policy,
    };
    const auditEvents = [];
    const billingJobs = [];
    const analyticsJobs = [];
    const persistedMessages = [];
    const policyEvents = [];
    const providerRequests = [];
    const reservationEvents = [];
    const reservationInputs = [];
    const usageRecords = [];
    let providerCalls = 0;
    const adapter = {
        providerId: "groq",
        async complete() {
            throw new Error("Non-stream completion is not used.");
        },
        async *stream() {
            throw new Error("Adapter stream is replaced by the test boundary.");
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
    const dependencies = {
        async assertConversationOwner() {},
        async loadOrganisationContext() {
            return {
                plan: "FREE",
                policy: resolvedPolicy,
                autoRoutingEnabled: false,
                retentionMode: "METADATA_ONLY",
            };
        },
        controls: {
            async consumeRateLimit() {},
        },
        idempotency: {
            async reserve(input) {
                reservationInputs.push(input);
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
        },
        async readBudgetStatus() {
            return {
                monthlyBudgetTokens: 10_000,
                usedTokens: 100,
                remainingTokens: 9_900,
                remainingPercent: 99,
                exceeded: false,
            };
        },
        processPrompt: processPiiPromptImmutably,
        async loadConversationHistory() {
            return [];
        },
        candidates: [{ adapter, model: "test-model" }],
        async readProviderHealth() {
            return { state: "UNKNOWN" };
        },
        async *streamProvider(input) {
            providerCalls += 1;
            providerRequests.push(input);
            yield { type: "token", text: "approved output" };
        },
        async appendUsage(input) {
            usageRecords.push(input);
            return input;
        },
        async enqueueBillingJob(input) {
            billingJobs.push(input);
            return input;
        },
        async enqueueAnalyticsJob(input) {
            analyticsJobs.push(input);
            return input;
        },
        async recordEnqueueFailure() {},
        emitPolicyEvent(input) {
            const event = createPolicyDecisionEvent(input);
            policyEvents.push(event);
            return event;
        },
        async appendAudit(input) {
            auditEvents.push(input);
        },
        async persistMessages(input) {
            persistedMessages.push(input);
        },
    };

    return {
        dependencies,
        auditEvents,
        billingJobs,
        analyticsJobs,
        persistedMessages,
        policyEvents,
        providerRequests,
        reservationEvents,
        reservationInputs,
        usageRecords,
        get providerCalls() {
            return providerCalls;
        },
    };
}

function createRequest(prompt) {
    return {
        conversationId: randomUUID(),
        prompt,
        clientRequestId: randomUUID(),
        providerId: "groq",
        routingMode: "manual",
    };
}

function prepare(runtime, prompt, request = createRequest(prompt)) {
    return prepareChatStream({
        auth: {
            orgId: randomUUID(),
            userId: randomUUID(),
            role: "EMPLOYEE",
            permissions: ["chat:send"],
            sessionId: randomUUID(),
        },
        requestId: randomUUID(),
        request,
        abortSignal: new AbortController().signal,
    }, runtime.dependencies);
}

function auditRecord(userAgent) {
    return {
        auditId: randomUUID(),
        orgId: randomUUID(),
        actorType: "SYSTEM",
        action: "auth.login_failed",
        outcome: "FAILURE",
        resourceType: "AUTH_SESSION",
        metadata: { reasonCode: "USER_NOT_FOUND" },
        userAgent,
        requestId: randomUUID(),
        occurredAt: new Date("2026-08-21T00:00:00.000Z"),
    };
}
