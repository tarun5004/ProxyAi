import assert from "node:assert/strict";
import test from "node:test";

import { RateLimitError } from "groq-sdk";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const { GroqProviderAdapter, GroqProviderError } = await import(
    "../dist/features/providers/groq-provider.adapter.js"
);

function createRequest(overrides = {}) {
    return {
        requestId: "req_groq_provider_test",
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        messages: [
            {
                role: "system",
                content: "Be concise.",
            },
            {
                role: "user",
                content: "Hello Groq",
            },
        ],
        maxOutputTokens: 32,
        ...overrides,
    };
}

function createAdapter(create, nowValues = [100, 125]) {
    const calls = [];
    const client = {
        chat: {
            completions: {
                create: async (body, options) => {
                    calls.push({ body, options });

                    return create(body, options);
                },
            },
        },
    };
    const now = () => nowValues.shift() ?? 125;
    const adapter = new GroqProviderAdapter({
        apiKey: "gsk_test_value",
        model: "openai/gpt-oss-20b",
        requestTimeoutMs: 30_000,
        client,
        now,
    });

    return { adapter, calls };
}

test("Groq adapter maps completion request and response", async () => {
    const abortController = new AbortController();
    const { adapter, calls } = createAdapter(() => ({
        id: "chatcmpl_test",
        object: "chat.completion",
        created: 1,
        model: "openai/gpt-oss-20b",
        choices: [
            {
                index: 0,
                finish_reason: "stop",
                message: {
                    role: "assistant",
                    content: "Mapped response",
                },
            },
        ],
        usage: {
            prompt_tokens: 4,
            completion_tokens: 2,
            total_tokens: 6,
        },
    }));

    const result = await adapter.complete(
        createRequest({ abortSignal: abortController.signal }),
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
        model: "openai/gpt-oss-20b",
        messages: [
            {
                role: "system",
                content: "Be concise.",
            },
            {
                role: "user",
                content: "Hello Groq",
            },
        ],
        max_completion_tokens: 32,
        stream: false,
    });
    assert.equal(calls[0].options.timeout, 30_000);
    assert.equal(calls[0].options.maxRetries, 0);
    assert.equal(calls[0].options.signal, abortController.signal);
    assert.deepEqual(result, {
        providerId: "groq",
        model: "openai/gpt-oss-20b",
        outputText: "Mapped response",
        finishReason: "stop",
        usage: {
            inputTokens: 4,
            outputTokens: 2,
            totalTokens: 6,
        },
        latencyMs: 25,
    });
});

test("Groq adapter maps streaming chunks", async () => {
    async function* streamChunks() {
        yield {
            id: "chunk_1",
            object: "chat.completion.chunk",
            created: 1,
            model: "openai/gpt-oss-20b",
            choices: [
                {
                    index: 0,
                    finish_reason: null,
                    delta: {
                        content: "Hello ",
                    },
                },
            ],
        };
        yield {
            id: "chunk_2",
            object: "chat.completion.chunk",
            created: 1,
            model: "openai/gpt-oss-20b",
            choices: [
                {
                    index: 0,
                    finish_reason: "length",
                    delta: {
                        content: "stream",
                    },
                },
            ],
            x_groq: {
                usage: {
                    prompt_tokens: 3,
                    completion_tokens: 2,
                    total_tokens: 5,
                },
            },
        };
    }
    const { adapter } = createAdapter(() => streamChunks());
    const chunks = [];

    for await (const chunk of adapter.stream(createRequest())) {
        chunks.push(chunk);
    }

    assert.deepEqual(chunks, [
        {
            type: "token",
            text: "Hello ",
        },
        {
            type: "token",
            text: "stream",
        },
        {
            type: "done",
            finishReason: "length",
            usage: {
                inputTokens: 3,
                outputTokens: 2,
                totalTokens: 5,
            },
            latencyMs: 25,
        },
    ]);
});

test("Groq adapter rejects terminal stream errors without a done chunk", async () => {
    async function* streamChunks() {
        yield {
            id: "chunk_1",
            object: "chat.completion.chunk",
            created: 1,
            model: "openai/gpt-oss-20b",
            choices: [
                {
                    index: 0,
                    finish_reason: null,
                    delta: { content: "Partial" },
                },
            ],
        };
        yield {
            id: "chunk_error",
            object: "chat.completion.chunk",
            created: 1,
            model: "openai/gpt-oss-20b",
            choices: [],
            x_groq: {
                error: "raw provider diagnostic",
            },
        };
    }
    const { adapter } = createAdapter(() => streamChunks());
    const iterator = adapter.stream(createRequest())[Symbol.asyncIterator]();

    assert.deepEqual(await iterator.next(), {
        done: false,
        value: { type: "token", text: "Partial" },
    });
    await assert.rejects(iterator.next(), (error) => {
        assert.equal(error instanceof GroqProviderError, true);
        assert.equal(error.category, "provider_error");
        assert.equal(error.retryable, true);
        assert.equal(error.message, "Groq provider stream stopped early.");
        assert.equal(error.message.includes("raw provider diagnostic"), false);

        return true;
    });
});

test("Groq adapter omits unavailable usage instead of synthesizing zero", async () => {
    const { adapter } = createAdapter(() => ({
        id: "chatcmpl_without_usage",
        object: "chat.completion",
        created: 1,
        model: "openai/gpt-oss-20b",
        choices: [
            {
                index: 0,
                finish_reason: "stop",
                message: {
                    role: "assistant",
                    content: "No usage metadata",
                },
            },
        ],
    }));

    const result = await adapter.complete(createRequest());

    assert.equal(Object.hasOwn(result, "usage"), false);
});

test("Groq adapter normalizes rate limit errors", async () => {
    const { adapter } = createAdapter(() => {
        throw new RateLimitError(429, {}, "raw sdk message", new Headers());
    });

    await assert.rejects(
        adapter.complete(createRequest()),
        (error) => {
            assert.equal(error instanceof GroqProviderError, true);
            assert.equal(error.isProviderError, true);
            assert.equal(error.category, "rate_limit");
            assert.equal(error.providerId, "groq");
            assert.equal(error.retryable, true);
            assert.equal(error.statusCode, 429);
            assert.equal(error.message, "Groq provider rate limit exceeded.");

            return true;
        },
    );
});

test("Groq adapter exposes configured health and capabilities", async () => {
    const { adapter } = createAdapter(() => ({
        id: "chatcmpl_health",
        object: "chat.completion",
        created: 1,
        model: "openai/gpt-oss-20b",
        choices: [
            {
                index: 0,
                finish_reason: "stop",
                message: {
                    role: "assistant",
                    content: "ok",
                },
            },
        ],
        usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
        },
    }));

    const health = await adapter.checkHealth();
    const capabilities = adapter.getCapabilities();

    assert.equal(health.providerId, "groq");
    assert.equal(health.status, "healthy");
    assert.equal(health.latencyMs, 25);
    assert.deepEqual(capabilities.supportedModels, [
        "openai/gpt-oss-20b",
    ]);
    assert.equal(capabilities.supportsStreaming, true);
    assert.equal(capabilities.supportsNonStreaming, true);
});
