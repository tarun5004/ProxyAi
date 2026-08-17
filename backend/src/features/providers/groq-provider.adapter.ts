import Groq, {
    APIConnectionError,
    APIConnectionTimeoutError,
    APIError,
    APIUserAbortError,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
    UnprocessableEntityError,
} from "groq-sdk";
import type {
    ChatCompletion,
    ChatCompletionChunk,
} from "groq-sdk/resources/chat/completions.js";
import type { CompletionUsage } from "groq-sdk/resources/completions.js";

import { env } from "../../config/env.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import {
    GROQ_PROVIDER_ID,
    getProviderCapabilities,
    getProviderModelCapability,
} from "./provider-capability.registry.js";
import type {
    CompletionRequest,
    CompletionResult,
    ProviderCapabilities,
    ProviderError,
    ProviderErrorCategory,
    ProviderFinishReason,
    ProviderHealth,
    StreamChunk,
    TokenUsage,
} from "./provider.types.js";

interface GroqRequestOptions {
    timeout: number;
    maxRetries: 0;
    signal?: AbortSignal;
}

interface GroqChatCompletionsClient {
    create(
        body: unknown,
        options: GroqRequestOptions,
    ): Promise<unknown>;
}

interface GroqClientLike {
    chat: {
        completions: GroqChatCompletionsClient;
    };
}

export interface GroqProviderAdapterOptions {
    apiKey: string;
    model: string;
    requestTimeoutMs: number;
    client?: GroqClientLike;
    now?: () => number;
}

interface GroqProviderErrorInput {
    category: ProviderErrorCategory;
    message: string;
    retryable: boolean;
    model?: string;
    statusCode?: number;
    providerRequestId?: string;
    latencyMs?: number;
}

export class GroqProviderError
    extends Error
    implements ProviderError {
    public readonly isProviderError = true;
    public readonly category: ProviderErrorCategory;
    public readonly providerId = GROQ_PROVIDER_ID;
    public readonly retryable: boolean;
    public readonly model?: string;
    public readonly statusCode?: number;
    public readonly providerRequestId?: string;
    public readonly latencyMs?: number;

    public constructor(input: GroqProviderErrorInput) {
        super(input.message);
        this.name = "GroqProviderError";
        this.category = input.category;
        this.retryable = input.retryable;

        if (input.model !== undefined) {
            this.model = input.model;
        }

        if (input.statusCode !== undefined) {
            this.statusCode = input.statusCode;
        }

        if (input.providerRequestId !== undefined) {
            this.providerRequestId = input.providerRequestId;
        }

        if (input.latencyMs !== undefined) {
            this.latencyMs = input.latencyMs;
        }
    }
}

export class GroqProviderAdapter implements ProviderAdapter {
    public readonly providerId = GROQ_PROVIDER_ID;

    private readonly model: string;
    private readonly requestTimeoutMs: number;
    private readonly client: GroqChatCompletionsClient;
    private readonly now: () => number;

    public constructor(options: GroqProviderAdapterOptions) {
        this.model = options.model;
        this.requestTimeoutMs = options.requestTimeoutMs;
        this.client = options.client?.chat.completions
            ?? createGroqClient(options.apiKey, options.requestTimeoutMs)
                .chat
                .completions;
        this.now = options.now ?? Date.now;
    }

    public async complete(
        request: CompletionRequest,
    ): Promise<CompletionResult> {
        this.assertSupportedRequest(request);
        const startedAt = this.now();

        try {
            const completion = await this.client.create(
                {
                    model: this.model,
                    messages: mapMessages(request),
                    max_completion_tokens: request.maxOutputTokens,
                    stream: false,
                },
                this.createRequestOptions(request.abortSignal),
            ) as ChatCompletion;
            const choice = completion.choices[0];

            if (!choice) {
                throw createInternalProviderError(
                    "Groq completion did not return a choice.",
                    request.model,
                    this.elapsedSince(startedAt),
                );
            }

            return {
                providerId: this.providerId,
                model: completion.model,
                outputText: choice.message.content ?? "",
                finishReason: mapFinishReason(choice.finish_reason),
                usage: mapUsage(completion.usage),
                latencyMs: this.elapsedSince(startedAt),
            };
        } catch (error: unknown) {
            throw normalizeGroqError(
                error,
                request.model,
                this.elapsedSince(startedAt),
            );
        }
    }

    public stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
        this.assertSupportedRequest(request);

        return this.createStream(request);
    }

    public async checkHealth(): Promise<ProviderHealth> {
        const startedAt = this.now();

        try {
            await this.client.create(
                {
                    model: this.model,
                    messages: [
                        {
                            role: "user",
                            content: "health",
                        },
                    ],
                    max_completion_tokens: 1,
                    stream: false,
                },
                this.createRequestOptions(),
            );

            return {
                providerId: this.providerId,
                status: "healthy",
                checkedAt: new Date(),
                latencyMs: this.elapsedSince(startedAt),
            };
        } catch (error: unknown) {
            const providerError = normalizeGroqError(
                error,
                this.model,
                this.elapsedSince(startedAt),
            );

            const health: ProviderHealth = {
                providerId: this.providerId,
                status: providerError.retryable ? "degraded" : "unhealthy",
                checkedAt: new Date(),
                errorCategory: providerError.category,
            };

            if (providerError.latencyMs !== undefined) {
                health.latencyMs = providerError.latencyMs;
            }

            return health;
        }
    }

    public getCapabilities(): ProviderCapabilities {
        return getProviderCapabilities(this.providerId);
    }

    private async *createStream(
        request: CompletionRequest,
    ): AsyncIterable<StreamChunk> {
        const startedAt = this.now();
        let usage: TokenUsage | undefined;
        let finishReason: ProviderFinishReason = "stop";

        try {
            const stream = await this.client.create(
                {
                    model: this.model,
                    messages: mapMessages(request),
                    max_completion_tokens: request.maxOutputTokens,
                    stream: true,
                },
                this.createRequestOptions(request.abortSignal),
            ) as AsyncIterable<ChatCompletionChunk>;

            for await (const chunk of stream) {
                const choice = chunk.choices[0];
                const text = choice?.delta.content;

                if (text) {
                    yield {
                        type: "token",
                        text,
                    };
                }

                if (choice?.finish_reason) {
                    finishReason = mapFinishReason(choice.finish_reason);
                }

                if (chunk.x_groq?.usage) {
                    usage = mapUsage(chunk.x_groq.usage);
                }
            }

            const doneChunk: StreamChunk = {
                type: "done",
                finishReason,
                latencyMs: this.elapsedSince(startedAt),
            };

            if (usage !== undefined) {
                doneChunk.usage = usage;
            }

            yield doneChunk;
        } catch (error: unknown) {
            throw normalizeGroqError(
                error,
                request.model,
                this.elapsedSince(startedAt),
            );
        }
    }

    private assertSupportedRequest(request: CompletionRequest): void {
        if (request.providerId !== this.providerId) {
            throw createInternalProviderError(
                "Completion request provider does not match Groq adapter.",
                request.model,
            );
        }

        if (request.model !== this.model) {
            throw createInternalProviderError(
                "Completion request model does not match configured Groq model.",
                request.model,
            );
        }

        getProviderModelCapability(this.providerId, request.model);
    }

    private createRequestOptions(
        signal?: AbortSignal,
    ): GroqRequestOptions {
        const options: GroqRequestOptions = {
            timeout: this.requestTimeoutMs,
            maxRetries: 0,
        };

        if (signal !== undefined) {
            options.signal = signal;
        }

        return options;
    }

    private elapsedSince(startedAt: number): number {
        return Math.max(0, this.now() - startedAt);
    }
}

export function createGroqProviderAdapter(): GroqProviderAdapter {
    return new GroqProviderAdapter({
        apiKey: env.GROQ_API_KEY,
        model: env.GROQ_MODEL,
        requestTimeoutMs: env.PROVIDER_REQUEST_TIMEOUT_MS,
    });
}

function createGroqClient(
    apiKey: string,
    requestTimeoutMs: number,
): GroqClientLike {
    return new Groq({
        apiKey,
        timeout: requestTimeoutMs,
        maxRetries: 0,
        logLevel: "off",
        logger: {
            error: () => undefined,
            warn: () => undefined,
            info: () => undefined,
            debug: () => undefined,
        },
    }) as unknown as GroqClientLike;
}

function mapMessages(
    request: CompletionRequest,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    return request.messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
}

function mapUsage(usage: CompletionUsage | undefined | null): TokenUsage {
    if (!usage) {
        return createUnknownUsage();
    }

    return {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
    };
}

function createUnknownUsage(): TokenUsage {
    return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
    };
}

function mapFinishReason(
    reason: "stop" | "length" | "tool_calls" | "function_call",
): "stop" | "length" | "tool_calls" {
    if (reason === "function_call") {
        return "tool_calls";
    }

    return reason;
}

function normalizeGroqError(
    error: unknown,
    model: string,
    latencyMs?: number,
): GroqProviderError {
    if (error instanceof GroqProviderError) {
        return error;
    }

    if (error instanceof APIConnectionTimeoutError
        || error instanceof APIUserAbortError) {
        return createProviderError(
            "timeout",
            "Groq provider request timed out.",
            true,
            model,
            undefined,
            latencyMs,
        );
    }

    if (error instanceof RateLimitError) {
        return createProviderError(
            "rate_limit",
            "Groq provider rate limit exceeded.",
            true,
            model,
            429,
            latencyMs,
        );
    }

    if (error instanceof AuthenticationError
        || error instanceof PermissionDeniedError) {
        return createProviderError(
            "authentication",
            "Groq provider authentication failed.",
            false,
            model,
            error.status,
            latencyMs,
        );
    }

    if (error instanceof BadRequestError
        || error instanceof UnprocessableEntityError) {
        return createProviderError(
            "invalid_request",
            "Groq provider rejected the request.",
            false,
            model,
            error.status,
            latencyMs,
        );
    }

    if (error instanceof APIConnectionError) {
        return createProviderError(
            "unavailable",
            "Groq provider is unavailable.",
            true,
            model,
            undefined,
            latencyMs,
        );
    }

    if (error instanceof APIError) {
        if (error.status === 503) {
            return createProviderError(
                "unavailable",
                "Groq provider is unavailable.",
                true,
                model,
                error.status,
                latencyMs,
            );
        }

        if (typeof error.status === "number" && error.status >= 500) {
            return createProviderError(
                "provider_error",
                "Groq provider returned an error.",
                true,
                model,
                error.status,
                latencyMs,
            );
        }
    }

    return createProviderError(
        "provider_error",
        "Groq provider request failed.",
        false,
        model,
        undefined,
        latencyMs,
    );
}

function createInternalProviderError(
    message: string,
    model: string,
    latencyMs?: number,
): GroqProviderError {
    return createProviderError(
        "invalid_request",
        message,
        false,
        model,
        400,
        latencyMs,
    );
}

function createProviderError(
    category: ProviderErrorCategory,
    message: string,
    retryable: boolean,
    model: string,
    statusCode?: number,
    latencyMs?: number,
): GroqProviderError {
    const input: GroqProviderErrorInput = {
        category,
        message,
        retryable,
        model,
    };

    if (statusCode !== undefined) {
        input.statusCode = statusCode;
    }

    if (latencyMs !== undefined) {
        input.latencyMs = latencyMs;
    }

    return new GroqProviderError(input);
}
