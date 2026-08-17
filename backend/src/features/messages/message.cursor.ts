import { z } from "zod";

import { AppError } from "../../shared/errors/app-error.js";
import type { MessageListCursor } from "./message.types.js";

const messageCursorSchema = z
    .object({
        createdAt: z.string().datetime(),
        messageId: z.string().uuid(),
    })
    .strict();

export function encodeMessageCursor(cursor: MessageListCursor): string {
    return Buffer.from(
        JSON.stringify({
            createdAt: cursor.createdAt.toISOString(),
            messageId: cursor.messageId,
        }),
        "utf8",
    ).toString("base64url");
}

export function decodeMessageCursor(encodedCursor: string): MessageListCursor {
    try {
        const decodedCursor: unknown = JSON.parse(
            Buffer.from(encodedCursor, "base64url").toString("utf8"),
        );
        const parsedCursor = messageCursorSchema.parse(decodedCursor);

        return {
            createdAt: new Date(parsedCursor.createdAt),
            messageId: parsedCursor.messageId,
        };
    } catch {
        throw new AppError(
            400,
            "INVALID_CURSOR",
            "Message cursor is invalid.",
        );
    }
}
