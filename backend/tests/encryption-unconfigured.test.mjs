import assert from "node:assert/strict";
import test from "node:test";

import {
    applyAuthTestEnvironment,
} from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/proxiai_encryption_unconfigured_test";
process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.DOTENV_CONFIG_PATH = "tests/helpers/nonexistent.env";
delete process.env.MESSAGE_ENCRYPTION_KEYS_JSON;
delete process.env.MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION;

const {
    hasEncryptionKeyVersion,
    initializeEncryption,
    isEncryptionReady,
    requireEncryptionService,
} = await import("../dist/shared/security/encryption.js");

test("unconfigured encryption remains unavailable without plaintext fallback", () => {
    initializeEncryption();

    assert.equal(isEncryptionReady(), false);
    assert.equal(hasEncryptionKeyVersion(1), false);
    assert.throws(
        () => requireEncryptionService(),
        (error) => error.statusCode === 503
            && error.code === "ENCRYPTION_UNAVAILABLE",
    );
});
