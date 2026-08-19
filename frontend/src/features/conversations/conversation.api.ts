import { z } from "zod";

import { createSuccessEnvelopeSchema } from "@/lib/api/api-envelope";
import { requestJson } from "@/lib/api/api-client";

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

export function createConversation(accessToken: string, title?: string) {
    return requestJson({
        path: "/conversations",
        method: "POST",
        accessToken,
        body: title === undefined ? {} : { title },
        schema: conversationResponseSchema,
    });
}

export function listConversations(accessToken: string, signal?: AbortSignal) {
    return requestJson({
        path: "/conversations?limit=100",
        accessToken,
        signal,
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
    signal?: AbortSignal,
) {
    return requestJson({
        path: `/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
        accessToken,
        signal,
        schema: messageListResponseSchema,
    });
}
