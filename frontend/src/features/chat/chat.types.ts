import { z } from "zod";

export const piiCategorySchema = z.enum([
    "CONTACT_INFO",
    "FINANCIAL",
    "GOVERNMENT_ID",
    "CREDENTIAL",
    "INTERNAL_SECRET",
    "BUSINESS_CONFIDENTIAL",
]);

const requestStartedEventSchema = z.object({
    requestId: z.string().uuid(),
    clientRequestId: z.string().uuid(),
});

const policyEventSchema = z.object({
    action: z.enum(["ALLOW", "ALLOW_WITH_MASK", "BLOCK"]),
    riskScore: z.number().min(0).max(100),
    categories: z.array(piiCategorySchema),
    masked: z.boolean(),
});

const routingEventSchema = z.object({
    provider: z.string(),
    routingReason: z.string(),
    fallbackPosition: z.number().int().nonnegative(),
});

const fallbackEventSchema = z.object({
    fromProvider: z.string().optional(),
    toProvider: z.string().optional(),
    reason: z.string().optional(),
}).passthrough();

const tokenEventSchema = z.object({ text: z.string() });

const doneEventSchema = z.object({
    requestId: z.string().uuid(),
    provider: z.string(),
    model: z.string(),
    routingReason: z.string(),
    usage: z.object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
    }).optional(),
    latencyMs: z.number().nonnegative(),
    cacheHit: z.boolean(),
    masked: z.boolean(),
});

const streamErrorEventSchema = z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    retryable: z.boolean(),
});

export const chatEventSchemas = {
    request_started: requestStartedEventSchema,
    policy: policyEventSchema,
    routing: routingEventSchema,
    fallback: fallbackEventSchema,
    token: tokenEventSchema,
    done: doneEventSchema,
    error: streamErrorEventSchema,
} as const;

export type PolicyEvent = z.infer<typeof policyEventSchema>;
export type RoutingEvent = z.infer<typeof routingEventSchema>;
export type FallbackEvent = z.infer<typeof fallbackEventSchema>;
export type DoneEvent = z.infer<typeof doneEventSchema>;

export type ChatEvent = {
    [Name in keyof typeof chatEventSchemas]: {
        type: Name;
        data: z.infer<(typeof chatEventSchemas)[Name]>;
    }
}[keyof typeof chatEventSchemas];

export interface UiChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    state: "complete" | "streaming" | "error";
}
