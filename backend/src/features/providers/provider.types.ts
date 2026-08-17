export const PROVIDER_IDS = [
    "groq",
    "gemini",
    "third",
] as const;

export const PROVIDER_MESSAGE_ROLES = [
    "system",
    "user",
    "assistant",
] as const;

export const PROVIDER_FINISH_REASONS = [
    "stop",
    "length",
    "content_filter",
    "tool_calls",
    "error",
] as const;

export const PROVIDER_HEALTH_STATUSES = [
    "healthy",
    "degraded",
    "unhealthy",
] as const;

export const PROVIDER_ERROR_CATEGORIES = [
    "timeout",
    "rate_limit",
    "authentication",
    "invalid_request",
    "unavailable",
    "provider_error",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];
export type ProviderMessageRole =
    (typeof PROVIDER_MESSAGE_ROLES)[number];
export type ProviderFinishReason =
    (typeof PROVIDER_FINISH_REASONS)[number];
export type ProviderHealthStatus =
    (typeof PROVIDER_HEALTH_STATUSES)[number];
export type ProviderErrorCategory =
    (typeof PROVIDER_ERROR_CATEGORIES)[number];

export interface ProviderMessage {
    role: ProviderMessageRole;
    content: string;
}

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

export interface CompletionRequest {
    requestId: string;
    providerId: ProviderId;
    model: string;
    messages: readonly ProviderMessage[];
    maxOutputTokens: number;
    abortSignal?: AbortSignal;
}

export interface CompletionResult {
    providerId: ProviderId;
    model: string;
    outputText: string;
    finishReason: ProviderFinishReason;
    usage: TokenUsage;
    latencyMs: number;
    estimatedCostUsd?: number;
}

export type StreamChunk =
    | {
        type: "token";
        text: string;
      }
    | {
        type: "done";
        finishReason: ProviderFinishReason;
        usage?: TokenUsage;
        latencyMs: number;
        estimatedCostUsd?: number;
      };

export interface ProviderCapabilities {
    providerId: ProviderId;
    supportedModels: readonly string[];
    supportsStreaming: boolean;
    supportsNonStreaming: boolean;
    maxInputTokens: number;
    maxOutputTokens: number;
}

export interface ProviderHealth {
    providerId: ProviderId;
    status: ProviderHealthStatus;
    checkedAt: Date;
    latencyMs?: number;
    errorCategory?: ProviderErrorCategory;
}

export interface ProviderError {
    isProviderError: true;
    category: ProviderErrorCategory;
    providerId: ProviderId;
    message: string;
    retryable: boolean;
    model?: string;
    statusCode?: number;
    providerRequestId?: string;
    latencyMs?: number;
}
