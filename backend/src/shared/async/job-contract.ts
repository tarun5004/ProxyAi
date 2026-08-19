import { z } from "zod";

import { PROVIDER_IDS } from "../../features/providers/provider.types.js";

export const ASYNC_JOB_SCHEMA_VERSION = 1 as const;
export const REQUEST_COMPLETED_JOB_TYPE = "request.completed" as const;

const uuidV4Schema = z.uuid({ version: "v4" });
const nonNegativeSafeIntegerSchema = z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER);

const tokenUsageSchema = z
    .strictObject({
        inputTokens: nonNegativeSafeIntegerSchema,
        outputTokens: nonNegativeSafeIntegerSchema,
        totalTokens: nonNegativeSafeIntegerSchema,
    })
    .refine(
        (usage) => usage.totalTokens
            === usage.inputTokens + usage.outputTokens,
        {
            message: "Token totals are inconsistent.",
            path: ["totalTokens"],
        },
    );

const requestCompletedJobSchema = z.strictObject({
    schemaVersion: z.literal(ASYNC_JOB_SCHEMA_VERSION),
    jobType: z.literal(REQUEST_COMPLETED_JOB_TYPE),
    requestId: uuidV4Schema,
    orgId: uuidV4Schema,
    userId: uuidV4Schema.optional(),
    providerId: z.enum(PROVIDER_IDS),
    model: z
        .string()
        .min(1)
        .max(200)
        .refine((model) => model.trim() === model),
    usage: tokenUsageSchema.optional(),
    estimatedCostMicros: nonNegativeSafeIntegerSchema.optional(),
    occurredAt: z.string().datetime(),
});

export type RequestCompletedJob = Readonly<
    z.infer<typeof requestCompletedJobSchema>
>;

export class InvalidAsyncJobPayloadError extends Error {
    public constructor() {
        super("Async job payload validation failed.");
        this.name = "InvalidAsyncJobPayloadError";
    }
}

export function parseRequestCompletedJob(
    input: unknown,
): RequestCompletedJob {
    const result = requestCompletedJobSchema.safeParse(input);

    if (!result.success) {
        throw new InvalidAsyncJobPayloadError();
    }

    return Object.freeze({
        ...result.data,
        ...(result.data.usage === undefined
            ? {}
            : { usage: Object.freeze(result.data.usage) }),
    });
}
