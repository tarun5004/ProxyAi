import { z } from "zod";

import {
    parseEnvironment,
    runtimeEnvSchema,
} from "./runtime-env.js";

const base64UrlSecretSchema = z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/)
    .refine((value) => {
        const decodedValue = Buffer.from(value, "base64url");

        return decodedValue.length >= 32
            && decodedValue.toString("base64url") === value;
    });

const envSchema = runtimeEnvSchema.extend({
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    FRONTEND_ORIGIN: z
        .string()
        .trim()
        .url()
        .refine((value) => new URL(value).origin === value),
    JWT_ACCESS_SECRET: base64UrlSecretSchema,
    AUTH_RATE_LIMIT_SECRET: base64UrlSecretSchema,
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30),
    CHAT_RATE_LIMIT_FREE_USER_RPM: z.coerce.number().int().min(1),
    CHAT_RATE_LIMIT_FREE_ORG_RPM: z.coerce.number().int().min(1),
    CHAT_RATE_LIMIT_PRO_USER_RPM: z.coerce.number().int().min(1),
    CHAT_RATE_LIMIT_PRO_ORG_RPM: z.coerce.number().int().min(1),
    CHAT_RATE_LIMIT_ENTERPRISE_USER_RPM: z.coerce.number().int().min(1),
    CHAT_RATE_LIMIT_ENTERPRISE_ORG_RPM: z.coerce.number().int().min(1),
    IDEMPOTENCY_PROCESSING_TTL_SECONDS: z.coerce
        .number()
        .pipe(z.literal(300)),
    IDEMPOTENCY_COMPLETED_TTL_SECONDS: z.coerce
        .number()
        .pipe(z.literal(3_600)),
}).superRefine((value, context) => {
    const hasKeys = value.MESSAGE_ENCRYPTION_KEYS_JSON !== undefined;
    const hasActiveVersion =
        value.MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION !== undefined;

    if (hasKeys !== hasActiveVersion) {
        context.addIssue({
            code: "custom",
            path: hasKeys
                ? ["MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION"]
                : ["MESSAGE_ENCRYPTION_KEYS_JSON"],
            message: "Encryption keyring variables must be configured together.",
        });
    }
});

export const env = parseEnvironment(envSchema);
