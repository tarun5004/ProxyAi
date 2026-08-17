import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { createSuccessResponse } from "../../shared/responses/api-response.js";
import { decodeMessageCursor } from "./message.cursor.js";
import { listMessagesQuerySchema } from "./message.schema.js";
import { listMessagesForConversationOwner } from "./message.service.js";
import { conversationPathSchema } from "../conversations/conversation.schema.js";

export async function listConversationMessages(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.auth) {
        throw new AppError(
            401,
            "UNAUTHORIZED",
            "Authentication required.",
        );
    }

    const parsedPath = conversationPathSchema.safeParse(request.params);
    const parsedQuery = listMessagesQuerySchema.safeParse(request.query);

    if (!parsedPath.success || !parsedQuery.success) {
        const issues = [
            ...(parsedPath.success ? [] : parsedPath.error.issues),
            ...(parsedQuery.success ? [] : parsedQuery.error.issues),
        ];

        throw new AppError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed.",
            issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
            })),
        );
    }

    const page = await listMessagesForConversationOwner({
        orgId: request.auth.orgId,
        userId: request.auth.userId,
        conversationId: parsedPath.data.conversationId,
        limit: parsedQuery.data.limit,
        ...(parsedQuery.data.cursor === undefined
            ? {}
            : {
                cursor: decodeMessageCursor(parsedQuery.data.cursor),
            }),
    });

    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(
        createSuccessResponse(
            {
                items: page.items,
            },
            request.requestId,
            page.nextCursor,
        ),
    );
}
