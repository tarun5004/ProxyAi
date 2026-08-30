import { Buffer } from "node:buffer";

import type { ProviderMessage } from "../providers/provider.types.js";
import type { RetainedConversationMessage } from "../messages/message.types.js";

export const MAX_PROVIDER_HISTORY_ESTIMATED_TOKENS = 4_000;

interface HistoryPair {
    requestId: string;
    user?: RetainedConversationMessage;
    assistant?: RetainedConversationMessage;
}

export function buildBoundedProviderHistory(input: Readonly<{
    messages: readonly RetainedConversationMessage[];
    sanitizeUserContent(content: string): string | null;
    maxEstimatedTokens?: number;
}>): readonly ProviderMessage[] {
    const pairs = pairMessagesByRequest(input.messages);
    const approvedPairs = pairs.flatMap((pair) => {
        if (!pair.user || !pair.assistant) {
            return [];
        }

        const approvedUserContent = input.sanitizeUserContent(pair.user.content);

        if (approvedUserContent === null) {
            return [];
        }

        return [[
            { role: "user" as const, content: approvedUserContent },
            { role: "assistant" as const, content: pair.assistant.content },
        ] as const];
    });
    const maxEstimatedTokens = input.maxEstimatedTokens
        ?? MAX_PROVIDER_HISTORY_ESTIMATED_TOKENS;
    const selectedPairs: (readonly [ProviderMessage, ProviderMessage])[] = [];
    let selectedTokenCount = 0;

    // Keep complete recent pairs so the model never receives an orphan answer.
    for (const pair of [...approvedPairs].reverse()) {
        const pairTokenCount = estimateMessageTokens(pair[0])
            + estimateMessageTokens(pair[1]);

        if (selectedTokenCount + pairTokenCount > maxEstimatedTokens) {
            break;
        }

        selectedPairs.push(pair);
        selectedTokenCount += pairTokenCount;
    }

    return Object.freeze(
        [...selectedPairs]
            .reverse()
            .flatMap((pair) => pair)
            .map((message) => Object.freeze(message)),
    );
}

function pairMessagesByRequest(
    messages: readonly RetainedConversationMessage[],
): readonly HistoryPair[] {
    const pairs = new Map<string, HistoryPair>();

    for (const message of messages) {
        const pair = pairs.get(message.requestId) ?? {
            requestId: message.requestId,
        };

        if (message.role === "user") {
            pair.user = message;
        } else {
            pair.assistant = message;
        }

        pairs.set(message.requestId, pair);
    }

    return [...pairs.values()];
}

function estimateMessageTokens(message: ProviderMessage): number {
    // One UTF-8 byte per token deliberately overestimates instead of overflowing context.
    return Buffer.byteLength(message.content, "utf8") + 4;
}
