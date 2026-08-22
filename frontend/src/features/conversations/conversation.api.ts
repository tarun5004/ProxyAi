import { z } from "zod";

import { createSuccessEnvelopeSchema } from "@/lib/api/api-envelope";
import { requestJson } from "@/lib/api/api-client";
import {
    createCursorPagePath,
    type CursorPageOptions,
} from "@/lib/api/cursor-pagination";

import {
    conversationSummarySchema,
    messageSummarySchema,
} from "./conversation.types";

const conversationResponseSchema = createSuccessEnvelopeSchema(
    conversationSummarySchema,
);
const conversationListResponseSchema = createSuccessEnvelopeSchema(
    z.object({ items: z.array(conversationSummarySchema) }),
);
const messageListResponseSchema = createSuccessEnvelopeSchema(
    z.object({ items: z.array(messageSummarySchema) }),
);

export const CONVERSATION_PAGE_LIMIT = 25;
export const MESSAGE_PAGE_LIMIT = 50;

export function createConversation(accessToken: string, title?: string) {
    return requestJson({
        path: "/conversations",
        method: "POST",
        accessToken,
        body: title === undefined ? {} : { title },
        schema: conversationResponseSchema,
    });
}

export function listConversations(
    accessToken: string,
    options: CursorPageOptions = {},
) {
    return requestJson({
        path: createCursorPagePath(
            "/conversations",
            CONVERSATION_PAGE_LIMIT,
            options.cursor,
        ),
        accessToken,
        signal: options.signal,
        schema: conversationListResponseSchema,
    });
}

export function getConversation(
    accessToken: string,
    conversationId: string,
    signal?: AbortSignal,
) {
    return requestJson({
        path: `/conversations/${encodeURIComponent(conversationId)}`,
        accessToken,
        signal,
        schema: conversationResponseSchema,
    });
}

export function updateConversationTitle(
    accessToken: string,
    conversationId: string,
    title: string,
) {
    return requestJson({
        path: `/conversations/${encodeURIComponent(conversationId)}`,
        method: "PATCH",
        accessToken,
        body: { title },
        schema: conversationResponseSchema,
    });
}

export function listConversationMessages(
    accessToken: string,
    conversationId: string,
    options: CursorPageOptions = {},
) {
    return requestJson({
        path: createCursorPagePath(
            `/conversations/${encodeURIComponent(conversationId)}/messages`,
            MESSAGE_PAGE_LIMIT,
            options.cursor,
        ),
        accessToken,
        signal: options.signal,
        schema: messageListResponseSchema,
    });
}
