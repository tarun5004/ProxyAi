import { z } from "zod";

export const chatStreamRequestSchema = z
    .object({
        conversationId: z.string().uuid(),
        prompt: z.string().trim().min(1).max(20_000),
        clientRequestId: z.string().uuid(),
        providerId: z.literal("groq").optional(),
        routingMode: z.enum(["manual", "auto"]).default("auto"),
    })
    .strict()
    .superRefine((input, context) => {
        if (
            input.routingMode === "manual"
            && input.providerId === undefined
        ) {
            context.addIssue({
                code: "custom",
                message: "providerId is required for manual routing.",
                path: ["providerId"],
            });
        }

        if (
            input.routingMode === "auto"
            && input.providerId !== undefined
        ) {
            context.addIssue({
                code: "custom",
                message: "providerId is not allowed for auto routing.",
                path: ["providerId"],
            });
        }
    });

export type ChatStreamRequest = z.infer<typeof chatStreamRequestSchema>;
