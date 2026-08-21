import { z } from "zod";

import { AppError } from "../../shared/errors/app-error.js";
import type { AdminListCursor } from "./admin.types.js";

const cursorSchema = z.strictObject({
    createdAt: z.string().datetime(),
    id: z.string().min(1).max(200),
});

export function encodeAdminCursor(cursor: AdminListCursor): string {
    return Buffer.from(JSON.stringify({
        createdAt: cursor.createdAt.toISOString(),
        id: cursor.id,
    }), "utf8").toString("base64url");
}

export function decodeAdminCursor(value: string): AdminListCursor {
    try {
        const parsed = cursorSchema.safeParse(
            JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown,
        );

        if (!parsed.success) {
            throw new Error("Invalid cursor.");
        }

        return {
            createdAt: new Date(parsed.data.createdAt),
            id: parsed.data.id,
        };
    } catch {
        throw new AppError(
            400,
            "INVALID_CURSOR",
            "Pagination cursor is invalid.",
            [{ field: "cursor", message: "Invalid pagination cursor." }],
        );
    }
}
