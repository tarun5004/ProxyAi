import { z } from "zod";

export const conversationSummarySchema = z.object({
    conversationId: z.string().uuid(),
    title: z.string(),
    messageCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    lastMessageAt: z.string().datetime().nullable(),
});

export const messageSummarySchema = z.object({
    messageId: z.string().uuid(),
    role: z.enum(["user", "assistant", "system"]),
    tokenCount: z.number().int().nonnegative().optional(),
    createdAt: z.string().datetime(),
    contentAvailable: z.literal(false),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type MessageSummary = z.infer<typeof messageSummarySchema>;
