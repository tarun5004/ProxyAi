import type { Request, RequestHandler, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { createSuccessResponse } from "../../shared/responses/api-response.js";
import { decodeConversationCursor } from "./conversation.cursor.js";
import {
    conversationPathSchema,
    createConversationRequestSchema,
    listConversationsQuerySchema,
} from "./conversation.schema.js";
import {
    createConversationForOwner,
    getConversationForOwner,
    listConversationsForOwner,
} from "./conversation.service.js";
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

export async function listConversations(
    request: Request,
    response: Response,
): Promise<void> {
    const auth = requireAuthContext(request);
    const parsedQuery = listConversationsQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
        throw createValidationError(parsedQuery.error.issues);
    }

    const page = await listConversationsForOwner({
        orgId: auth.orgId,
        userId: auth.userId,
        limit: parsedQuery.data.limit,
        ...(parsedQuery.data.cursor === undefined
            ? {}
            : {
                cursor: decodeConversationCursor(parsedQuery.data.cursor),
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

export async function getConversation(
    request: Request,
    response: Response,
): Promise<void> {
    const auth = requireAuthContext(request);
    const parsedPath = conversationPathSchema.safeParse(request.params);

    if (!parsedPath.success) {
        throw createValidationError(parsedPath.error.issues);
    }

    const conversation = await getConversationForOwner(
        auth.orgId,
        auth.userId,
        parsedPath.data.conversationId,
    );

    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(
        createSuccessResponse(conversation, request.requestId),
    );
}

function requireAuthContext(request: Request) {
    if (!request.auth) {
        throw new AppError(
            401,
            "UNAUTHORIZED",
            "Authentication required.",
        );
    }

    return request.auth;
}

function createValidationError(
    issues: readonly {
        message: string;
        path: PropertyKey[];
    }[],
): AppError {
    return new AppError(
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
        issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
        })),
    );
}
