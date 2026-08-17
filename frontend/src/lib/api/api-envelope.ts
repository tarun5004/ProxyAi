import { z } from "zod";

export function createSuccessEnvelopeSchema<T extends z.ZodType>(data: T) {
    return z.object({
        success: z.literal(true),
        data,
        meta: z.object({
            requestId: z.string(),
            nextCursor: z.string().nullable().optional(),
        }),
    });
}
