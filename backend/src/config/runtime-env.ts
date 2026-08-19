import "dotenv/config";
import { z } from "zod";

export const runtimeEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace"])
        .default("info"),
    MONGO_URI: z.string().trim().min(1),
    REDIS_URL: z.string().trim().min(1),
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

export function parseEnvironment<Schema extends z.ZodType>(
    schema: Schema,
): Readonly<z.output<Schema>> {
    const result = schema.safeParse(process.env);

    if (!result.success) {
        const invalidVariables = [
            ...new Set(
                result.error.issues.map(
                    (issue) => String(issue.path[0] ?? "environment"),
                ),
            ),
        ];

        throw new Error(
            `Invalid environment configuration: ${invalidVariables.join(", ")}`,
        );
    }

    return Object.freeze(result.data);
}

export const runtimeEnv = parseEnvironment(runtimeEnvSchema);
