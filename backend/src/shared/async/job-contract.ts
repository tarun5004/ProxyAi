import { z } from "zod";

import { PROVIDER_IDS } from "../../features/providers/provider.types.js";

export const ASYNC_JOB_SCHEMA_VERSION = 1 as const;
export const REQUEST_COMPLETED_JOB_TYPE = "request.completed" as const;
export const REQUEST_BLOCKED_JOB_TYPE = "request.blocked" as const;
export const REQUEST_COMPLETED_STATUSES = [
    "COMPLETED",
    "FAILED",
    "INTERRUPTED",
] as const;
export const REQUEST_POLICY_ACTIONS = [
    "ALLOW",
    "ALLOW_WITH_MASK",
] as const;

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
    userId: uuidV4Schema,
    status: z.enum(REQUEST_COMPLETED_STATUSES),
    policyAction: z.enum(REQUEST_POLICY_ACTIONS),
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

const requestBlockedJobSchema = z.strictObject({
    schemaVersion: z.literal(ASYNC_JOB_SCHEMA_VERSION),
    jobType: z.literal(REQUEST_BLOCKED_JOB_TYPE),
    requestId: uuidV4Schema,
    orgId: uuidV4Schema,
    userId: uuidV4Schema,
    status: z.literal("BLOCKED"),
    policyAction: z.literal("BLOCK"),
    occurredAt: z.string().datetime(),
});

const analyticsRequestOutcomeJobSchema = z.discriminatedUnion(
    "jobType",
    [requestCompletedJobSchema, requestBlockedJobSchema],
);

export type RequestCompletedJob = Readonly<
    z.infer<typeof requestCompletedJobSchema>
>;
export type RequestBlockedJob = Readonly<
    z.infer<typeof requestBlockedJobSchema>
>;
export type AnalyticsRequestOutcomeJob = Readonly<
    z.infer<typeof analyticsRequestOutcomeJobSchema>
>;
export type RequestCompletedStatus =
    (typeof REQUEST_COMPLETED_STATUSES)[number];
export type RequestOutcomeStatus = RequestCompletedStatus | "BLOCKED";
export type RequestOutcomePolicyAction =
    (typeof REQUEST_POLICY_ACTIONS)[number] | "BLOCK";

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

export function parseAnalyticsRequestOutcomeJob(
    input: unknown,
): AnalyticsRequestOutcomeJob {
    const result = analyticsRequestOutcomeJobSchema.safeParse(input);

    if (!result.success) {
        throw new InvalidAsyncJobPayloadError();
    }

    return Object.freeze({
        ...result.data,
        ...(
            result.data.jobType === REQUEST_COMPLETED_JOB_TYPE
            && result.data.usage !== undefined
                ? { usage: Object.freeze(result.data.usage) }
                : {}
        ),
    });
}
