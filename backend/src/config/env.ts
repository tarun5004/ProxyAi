import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace"])
        .default("info"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    MONGO_URI: z.string().trim().min(1),
    REDIS_URL: z.string().trim().min(1),
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
