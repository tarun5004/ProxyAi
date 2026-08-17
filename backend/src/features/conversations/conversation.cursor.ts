import { z } from "zod";

import { AppError } from "../../shared/errors/app-error.js";
import type { ConversationListCursor } from "./conversation.types.js";

const conversationCursorSchema = z
    .object({
        conversationId: z.string().uuid(),
        lastMessageAt: z.string().datetime().nullable(),
    })
    .strict();

export function encodeConversationCursor(
    cursor: ConversationListCursor,
): string {
    return Buffer.from(
        JSON.stringify({
            conversationId: cursor.conversationId,
            lastMessageAt: cursor.lastMessageAt?.toISOString() ?? null,
        }),
        "utf8",
    ).toString("base64url");
}

export function decodeConversationCursor(
    encodedCursor: string,
): ConversationListCursor {
    try {
        const decodedCursor: unknown = JSON.parse(
            Buffer.from(encodedCursor, "base64url").toString("utf8"),
        );
        const parsedCursor = conversationCursorSchema.parse(decodedCursor);

        return {
            conversationId: parsedCursor.conversationId,
            lastMessageAt:
                parsedCursor.lastMessageAt === null
                    ? null
                    : new Date(parsedCursor.lastMessageAt),
        };
    } catch {
        throw new AppError(
            400,
            "INVALID_CURSOR",
            "Conversation cursor is invalid.",
        );
    }
}
