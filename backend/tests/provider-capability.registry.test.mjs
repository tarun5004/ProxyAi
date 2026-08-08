import assert from "node:assert/strict";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/proxiai_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const {
    createProviderCapabilityRegistry,
    getProviderCapabilities,
    getProviderModelCapability,
    ProviderRegistryError,
} = await import(
    "../dist/features/providers/provider-capability.registry.js"
);

test("provider registry looks up configured provider capabilities", () => {
    const registry = createProviderCapabilityRegistry("groq-test-model");

    const capabilities = getProviderCapabilities("groq", registry);

    assert.deepEqual(capabilities.supportedModels, ["groq-test-model"]);
    assert.equal(capabilities.supportsStreaming, true);
    assert.equal(capabilities.supportsNonStreaming, true);
    assert.equal(capabilities.maxInputTokens, 20_000);
    assert.equal(capabilities.maxOutputTokens, 4_096);
});

test("provider registry looks up model capabilities", () => {
    const registry = createProviderCapabilityRegistry("groq-test-model");

    const modelCapability = getProviderModelCapability(
        "groq",
        "groq-test-model",
        registry,
    );

    assert.deepEqual(modelCapability, {
        providerId: "groq",
        model: "groq-test-model",
        supportsStreaming: true,
        supportsNonStreaming: true,
        maxInputTokens: 20_000,
        maxOutputTokens: 4_096,
    });
});

test("provider registry rejects unsupported provider and model", () => {
    const registry = createProviderCapabilityRegistry("groq-test-model");

    assert.throws(
        () => getProviderCapabilities("gemini", registry),
        (error) => {
            assert.equal(error instanceof ProviderRegistryError, true);
            assert.equal(error.category, "invalid_request");
            assert.equal(error.providerId, "gemini");
            assert.equal(error.retryable, false);

            return true;
        },
    );
    assert.throws(
        () => getProviderModelCapability(
            "groq",
            "unsupported-model",
            registry,
        ),
        (error) => {
            assert.equal(error instanceof ProviderRegistryError, true);
            assert.equal(error.category, "invalid_request");
            assert.equal(error.providerId, "groq");
            assert.equal(error.model, "unsupported-model");
            assert.equal(error.retryable, false);

            return true;
        },
    );
});

test("provider registry exposes immutable entries without map mutators", () => {
    const registry = createProviderCapabilityRegistry("groq-test-model");
    const capabilities = getProviderCapabilities("groq", registry);
    const modelCapability = getProviderModelCapability(
        "groq",
        "groq-test-model",
        registry,
    );

    assert.equal(Object.isFrozen(registry), true);
    assert.equal(Object.isFrozen(capabilities), true);
    assert.equal(Object.isFrozen(capabilities.models), true);
    assert.equal(Object.isFrozen(modelCapability), true);
    assert.equal(registry.set, undefined);
});
