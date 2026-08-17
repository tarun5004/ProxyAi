import type { Request, RequestHandler, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { createSuccessResponse } from "../../shared/responses/api-response.js";
import { createConversationRequestSchema } from "./conversation.schema.js";
import { createConversationForOwner } from "./conversation.service.js";
import type {
    ConversationSummary,
    CreateConversationInput,
} from "./conversation.types.js";

type CreateConversation = (
    input: CreateConversationInput,
) => Promise<ConversationSummary>;

export function createConversationHandler(
    createConversation: CreateConversation = createConversationForOwner,
): RequestHandler {
    return async function handleCreateConversation(
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

        const parsedRequest = createConversationRequestSchema.safeParse(
            request.body === undefined ? {} : request.body,
        );

        if (!parsedRequest.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Request validation failed.",
                parsedRequest.error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                })),
            );
        }

        const conversation = await createConversation({
            orgId: request.auth.orgId,
            userId: request.auth.userId,
            ...(parsedRequest.data.title === undefined
                ? {}
                : {
                    title: parsedRequest.data.title,
                }),
        });

        response.setHeader("Cache-Control", "no-store");
        response.status(201).json(
            createSuccessResponse(conversation, request.requestId),
        );
    };
}

export const createConversation = createConversationHandler();
