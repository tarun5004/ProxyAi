import { z } from "zod";

export const createConversationRequestSchema = z
    .object({
        title: z.string().trim().min(1).max(120).optional(),
    })
    .strict();

export const listConversationsQuerySchema = z
    .object({
        cursor: z.string().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
    })
    .strict();

export const conversationPathSchema = z
    .object({
        conversationId: z.string().uuid(),
    })
    .strict();
