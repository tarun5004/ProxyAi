import pino from "pino";

import { runtimeEnv } from "../../config/runtime-env.js";

export type LoggerService = "proxiai-api" | "proxiai-worker";

const sensitiveFields = [
    "authorization",
    "cookie",
    "email",
    "emailNormalized",
    "organisationSlug",
    "password",
    "passwordHash",
    "hash",
    "jwt",
    "token",
    "tokenHash",
    "rawToken",
    "accessToken",
    "refreshToken",
    "resetToken",
    "apiKey",
    "GROQ_API_KEY",
    "secret",
    "prompt",
    "providerPrompt",
    "maskedPrompt",
    "originalUserContent",
    "assistantContent",
    "responseText",
    "outputText",
    "content",
    "messages",
    "title",
    "plaintext",
    "decryptedContent",
    "decryptedTitle",
    "encryptedPayload",
    "promptEnc",
    "responseEnc",
    "contentEnc",
    "titleEnc",
    "ciphertext",
    "iv",
    "authTag",
    "MESSAGE_ENCRYPTION_KEYS_JSON",
    "encryptionKey",
    "MONGO_URI",
    "REDIS_URL",
    "mongoUri",
    "redisUrl",
    "uri",
    "url",
    "connectionString",
    "JWT_ACCESS_SECRET",
    "AUTH_RATE_LIMIT_SECRET",
    "jwtAccessSecret",
    "authRateLimitSecret",
] as const;

const redactionPaths = [
    "req",
    "request",
    "res",
    "response",
    "err",
    "error",
    "headers['set-cookie']",
    "*.headers['set-cookie']",
    "*.*.headers['set-cookie']",
    ...sensitiveFields.flatMap((field) => [
        field,
        `*.${field}`,
        `*.*.${field}`,
    ]),
];

function createLogger(service: LoggerService) {
    return pino({
        level: runtimeEnv.LOG_LEVEL,
        base: {
            service,
            environment: runtimeEnv.NODE_ENV,
        },
        redact: {
            paths: redactionPaths,
            censor: "[REDACTED]",
        },
    });
}

export let logger = createLogger("proxiai-api");

export function configureLoggerService(service: LoggerService): void {
    logger = createLogger(service);
}
