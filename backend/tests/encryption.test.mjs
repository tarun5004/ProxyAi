import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();

const {
    createEncryptionService,
    hasEncryptionKeyVersion,
    initializeEncryption,
    isEncryptionReady,
    loadEncryptionKeyring,
    normalizeEncryptedPayload,
    requireEncryptionService,
} = await import("../dist/shared/security/encryption.js");

const key = randomBytes(32).toString("base64url");
const service = createEncryptionService(loadEncryptionKeyring(
    JSON.stringify({ 1: key }),
    1,
));
const context = Object.freeze({
    orgId: randomUUID(),
    entityType: "MESSAGE",
    entityId: randomUUID(),
    fieldName: "content",
    conversationId: randomUUID(),
    messageId: randomUUID(),
});

test("AES-GCM roundtrip uses unique IVs and canonical envelope", () => {
    const first = service.encrypt("sensitive text", context);
    const second = service.encrypt("sensitive text", context);

    assert.equal(first.algorithm, "AES-256-GCM");
    assert.notEqual(first.iv, second.iv);
    assert.equal(service.decrypt(first, context), "sensitive text");
    assert.equal(JSON.stringify(first).includes("sensitive text"), false);
});

test("wrong AAD and tampered ciphertext fail authentication", () => {
    const encrypted = service.encrypt("sensitive text", context);
    const finalCharacter = encrypted.ciphertext.at(-1);
    const tamperedCiphertext = `${encrypted.ciphertext.slice(0, -1)}${
        finalCharacter === "A" ? "B" : "A"
    }`;

    assert.throws(() => service.decrypt(encrypted, {
        ...context,
        orgId: randomUUID(),
    }), (error) => error.code === "MESSAGE_CONTENT_UNAVAILABLE");
    assert.throws(() => service.decrypt({
        ...encrypted,
        ciphertext: tamperedCiphertext,
    }, context), (error) => error.code === "MESSAGE_CONTENT_UNAVAILABLE");
});

test("missing key version fails without exposing key material", () => {
    const encrypted = service.encrypt("sensitive text", context);

    assert.throws(() => service.decrypt({
        ...encrypted,
        keyVersion: 2,
    }, context), (error) => {
        assert.equal(error.code, "ENCRYPTION_UNAVAILABLE");
        assert.equal(error.message.includes(key), false);
        return true;
    });
});

test("keyring validation rejects malformed, non-canonical, and inactive keys", () => {
    assert.throws(() => loadEncryptionKeyring("not-json", 1), /Invalid environment configuration/);
    assert.throws(() => loadEncryptionKeyring(JSON.stringify({ 0: key }), 1), /Invalid environment configuration/);
    assert.throws(() => loadEncryptionKeyring(JSON.stringify({ 1: "short" }), 1), /Invalid environment configuration/);
    assert.throws(() => loadEncryptionKeyring(JSON.stringify({ 1: key }), 2), /Invalid environment configuration/);
});

test("malformed envelopes fail closed before decryption", () => {
    const encrypted = service.encrypt("sensitive text", context);
    const malformed = [
        { ...encrypted, algorithm: "AES-128-GCM" },
        { ...encrypted, iv: "not-canonical=" },
        { ...encrypted, authTag: "AA" },
        { ...encrypted, ciphertext: "" },
        { ...encrypted, unexpected: "field" },
    ];

    for (const payload of malformed) {
        assert.throws(
            () => service.decrypt(payload, context),
            (error) => error.code === "MESSAGE_CONTENT_UNAVAILABLE",
        );
    }
});

test("runtime encryption initializes every configured version without exposing keys", () => {
    initializeEncryption();

    assert.equal(isEncryptionReady(), true);
    assert.equal(hasEncryptionKeyVersion(1), true);
    assert.equal(hasEncryptionKeyVersion(99), false);
    const runtimeService = requireEncryptionService();
    const encrypted = runtimeService.encrypt("runtime secret", context);
    const normalized = normalizeEncryptedPayload(encrypted);

    assert.deepEqual(normalized, encrypted);
    assert.equal(runtimeService.decrypt(normalized, context), "runtime secret");
    assert.equal(JSON.stringify(normalized).includes("runtime secret"), false);
});

test("encryption fails closed for absent or invalid in-memory key material", () => {
    const missingKeyService = createEncryptionService({
        activeVersion: 1,
        keys: new Map(),
    });
    const invalidKeyService = createEncryptionService({
        activeVersion: 1,
        keys: new Map([[1, Buffer.alloc(16)]]),
    });

    assert.throws(
        () => missingKeyService.encrypt("secret", context),
        (error) => error.code === "ENCRYPTION_UNAVAILABLE",
    );
    assert.throws(
        () => invalidKeyService.encrypt("secret", context),
        (error) => error.code === "ENCRYPTION_UNAVAILABLE",
    );
});

test("conversation AAD without a message ID remains context-bound", () => {
    const conversationContext = {
        orgId: randomUUID(),
        entityType: "CONVERSATION",
        entityId: randomUUID(),
        fieldName: "title",
        conversationId: randomUUID(),
    };
    const encrypted = service.encrypt("private title", conversationContext);

    assert.equal(service.decrypt(encrypted, conversationContext), "private title");
    assert.throws(
        () => service.decrypt(encrypted, {
            ...conversationContext,
            conversationId: randomUUID(),
        }),
        (error) => error.code === "MESSAGE_CONTENT_UNAVAILABLE",
    );
});
