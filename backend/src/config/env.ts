import "dotenv/config";
import { z } from "zod";

const base64UrlSecretSchema = z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/)
    .refine((value) => {
        const decodedValue = Buffer.from(value, "base64url");

        return decodedValue.length >= 32
            && decodedValue.toString("base64url") === value;
    });

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace"])
        .default("info"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    FRONTEND_ORIGIN: z
        .string()
        .trim()
        .url()
        .refine((value) => new URL(value).origin === value),
    MONGO_URI: z.string().trim().min(1),
    REDIS_URL: z.string().trim().min(1),
    JWT_ACCESS_SECRET: base64UrlSecretSchema,
    AUTH_RATE_LIMIT_SECRET: base64UrlSecretSchema,
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30),
    GROQ_API_KEY: z.string().trim().min(1),
    GROQ_MODEL: z.string().trim().min(1),
    PROVIDER_REQUEST_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1_000)
        .max(120_000),
    COMMIT_SHA: z.preprocess(
        (value) =>
            typeof value === "string" && value.trim() === "" ? undefined : value,
        z.string().trim().min(1).optional(),
    ),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
    const invalidVariables = [
        ...new Set(
            result.error.issues.map((issue) => String(issue.path[0] ?? "environment")),
        ),
    ];

    throw new Error(
        `Invalid environment configuration: ${invalidVariables.join(", ")}`,
    );
}

export const env = Object.freeze(result.data);
