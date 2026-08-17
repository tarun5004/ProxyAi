import { z } from "zod";

export const createConversationRequestSchema = z
    .object({
        title: z.string().trim().min(1).max(120).optional(),
    })
    .strict();
