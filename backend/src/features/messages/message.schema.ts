import { z } from "zod";

export const listMessagesQuerySchema = z
    .object({
        cursor: z.string().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .strict();
