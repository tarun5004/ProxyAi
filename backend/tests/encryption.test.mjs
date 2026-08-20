import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import "./helpers/test-env.mjs";

const {
    createEncryptionService,
    loadEncryptionKeyring,
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

    assert.throws(() => service.decrypt(encrypted, {
        ...context,
        orgId: randomUUID(),
    }), (error) => error.code === "MESSAGE_CONTENT_UNAVAILABLE");
    assert.throws(() => service.decrypt({
        ...encrypted,
        ciphertext: `${encrypted.ciphertext.slice(0, -1)}A`,
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
