import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { authTestEnvironment } from "./helpers/test-env.mjs";

const validEnvironment = {
    ...process.env,
    ...authTestEnvironment,
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    PORT: "8080",
    FRONTEND_ORIGIN: "http://localhost:3000",
    MONGO_URI: "mongodb://localhost:27017/proxiai-test",
    REDIS_URL: "redis://localhost:6379",
};

function writeLog(data, message) {
    const script = `
        import { logger } from "./dist/shared/lib/logger.js";
        logger.info(${JSON.stringify(data)}, ${JSON.stringify(message)});
    `;
    const result = spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", script],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: validEnvironment,
        },
    );

    assert.equal(result.status, 0, result.stderr);

    const output = result.stdout.trim();
    assert.notEqual(output, "");

    return {
        entry: JSON.parse(output),
        output,
    };
}

function writeWorkerLog() {
    const script = `
        import {
            configureLoggerService,
            logger,
        } from "./dist/shared/lib/logger.js";
        configureLoggerService("proxiai-worker");
        logger.info({ event: "worker.logger.test" }, "Worker logger test");
    `;
    const result = spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", script],
        {
            cwd: process.cwd(),
            encoding: "utf8",
            env: validEnvironment,
        },
    );

    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim());
}

test("logger includes stable base fields", () => {
    const { entry } = writeLog(
        {
            event: "logger.test",
        },
        "Logger test",
    );

    assert.equal(entry.service, "proxiai-api");
    assert.equal(entry.environment, "test");
    assert.equal(entry.event, "logger.test");
    assert.equal(entry.msg, "Logger test");
});

test("worker runtime uses the worker service identity", () => {
    const entry = writeWorkerLog();

    assert.equal(entry.service, "proxiai-worker");
    assert.equal(entry.environment, "test");
});

test("logger redacts sensitive values and preserves safe metadata", () => {
    const sentinels = {
        accessToken: "SENTINEL_ACCESS_TOKEN",
        apiKey: "SENTINEL_API_KEY",
        authorization: "SENTINEL_AUTHORIZATION",
        content: "SENTINEL_PLAINTEXT_CONTENT",
        contentEnc: "SENTINEL_ENCRYPTED_CONTENT",
        cookie: "SENTINEL_COOKIE",
        decryptedTitle: "SENTINEL_DECRYPTED_TITLE",
        email: "SENTINEL_EMAIL",
        encryptedPayload: "SENTINEL_ENCRYPTED_PAYLOAD",
        encryptionKey: "SENTINEL_ENCRYPTION_KEY",
        error: "SENTINEL_ERROR_OBJECT",
        jwt: "SENTINEL_JWT",
        mongoUri: "SENTINEL_MONGO_URI",
        password: "SENTINEL_PASSWORD",
        nestedPasswordHash: "SENTINEL_NESTED_PASSWORD_HASH",
        organisationSlug: "SENTINEL_ORGANISATION_SLUG",
        passwordHash: "SENTINEL_PASSWORD_HASH",
        prompt: "SENTINEL_PROMPT",
        providerPrompt: "SENTINEL_PROVIDER_PROMPT",
        rawToken: "SENTINEL_RAW_TOKEN",
        redisUrl: "SENTINEL_REDIS_URL",
        refreshToken: "SENTINEL_REFRESH_TOKEN",
        responseText: "SENTINEL_RESPONSE",
        tokenHash: "SENTINEL_TOKEN_HASH",
        uri: "SENTINEL_CONNECTION_URI",
    };
    const { entry, output } = writeLog(
        {
            event: "logger.redaction.test",
            email: sentinels.email,
            organisationSlug: sentinels.organisationSlug,
            password: sentinels.password,
            passwordHash: sentinels.passwordHash,
            error: {
                message: sentinels.error,
            },
            rawToken: sentinels.rawToken,
            req: {
                headers: {
                    authorization: sentinels.authorization,
                    cookie: sentinels.cookie,
                },
            },
            safeField: "SAFE_VALUE",
            sensitive: {
                accessToken: sentinels.accessToken,
                apiKey: sentinels.apiKey,
                content: sentinels.content,
                contentEnc: sentinels.contentEnc,
                decryptedTitle: sentinels.decryptedTitle,
                encryptedPayload: sentinels.encryptedPayload,
                encryptionKey: sentinels.encryptionKey,
                jwt: sentinels.jwt,
                mongoUri: sentinels.mongoUri,
                passwordHash: sentinels.nestedPasswordHash,
                prompt: sentinels.prompt,
                providerPrompt: sentinels.providerPrompt,
                redisUrl: sentinels.redisUrl,
                refreshToken: sentinels.refreshToken,
                responseText: sentinels.responseText,
                tokenHash: sentinels.tokenHash,
                uri: sentinels.uri,
            },
        },
        "Redaction test",
    );

    for (const sentinel of Object.values(sentinels)) {
        assert.equal(output.includes(sentinel), false);
    }

    assert.equal(entry.password, "[REDACTED]");
    assert.equal(entry.passwordHash, "[REDACTED]");
    assert.equal(entry.email, "[REDACTED]");
    assert.equal(entry.organisationSlug, "[REDACTED]");
    assert.equal(entry.rawToken, "[REDACTED]");
    assert.equal(entry.req, "[REDACTED]");
    assert.equal(entry.error, "[REDACTED]");
    assert.equal(entry.sensitive.accessToken, "[REDACTED]");
    assert.equal(entry.sensitive.apiKey, "[REDACTED]");
    assert.equal(entry.sensitive.content, "[REDACTED]");
    assert.equal(entry.sensitive.contentEnc, "[REDACTED]");
    assert.equal(entry.sensitive.decryptedTitle, "[REDACTED]");
    assert.equal(entry.sensitive.encryptedPayload, "[REDACTED]");
    assert.equal(entry.sensitive.encryptionKey, "[REDACTED]");
    assert.equal(entry.sensitive.jwt, "[REDACTED]");
    assert.equal(entry.sensitive.mongoUri, "[REDACTED]");
    assert.equal(entry.sensitive.passwordHash, "[REDACTED]");
    assert.equal(entry.sensitive.prompt, "[REDACTED]");
    assert.equal(entry.sensitive.providerPrompt, "[REDACTED]");
    assert.equal(entry.sensitive.redisUrl, "[REDACTED]");
    assert.equal(entry.sensitive.refreshToken, "[REDACTED]");
    assert.equal(entry.sensitive.responseText, "[REDACTED]");
    assert.equal(entry.sensitive.tokenHash, "[REDACTED]");
    assert.equal(entry.sensitive.uri, "[REDACTED]");
    assert.equal(entry.safeField, "SAFE_VALUE");
});
