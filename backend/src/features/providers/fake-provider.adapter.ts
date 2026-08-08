import type { ProviderAdapter } from "./provider-adapter.js";
import {
    FAKE_MAX_INPUT_TOKENS,
    FAKE_MAX_OUTPUT_TOKENS,
    FAKE_PROVIDER_ID,
    FAKE_PROVIDER_MODEL_ID,
    getProviderCapabilities,
} from "./provider-capability.registry.js";
import type {
    CompletionRequest,
    CompletionResult,
    ProviderCapabilities,
    ProviderError,
    ProviderErrorCategory,
    ProviderHealth,
    ProviderId,
    StreamChunk,
    TokenUsage,
} from "./provider.types.js";

export const FAKE_PROVIDER_DEFAULT_MODEL = FAKE_PROVIDER_MODEL_ID;
export const FAKE_PROVIDER_DEFAULT_COMPLETION =
    "Fake provider response.";

export type FakeProviderMode =
    | "success"
    | "timeout"
    | "rate_limit"
    | "server_error"
    | "mid_stream_failure";

export interface FakeProviderAdapterOptions {
    providerId?: ProviderId;
    model?: string;
    mode?: FakeProviderMode;
    completionText?: string;
    streamTokens?: readonly string[];
    latencyMs?: number;
    estimatedCostUsd?: number;
}

interface FakeProviderErrorInput {
    category: ProviderErrorCategory;
    providerId: ProviderId;
    message: string;
    retryable: boolean;
    model?: string;
    statusCode?: number;
    providerRequestId?: string;
    latencyMs?: number;
}

export class FakeProviderError
    extends Error
    implements ProviderError {
    public readonly isProviderError = true;
    public readonly category: ProviderErrorCategory;
    public readonly providerId: ProviderId;
    public readonly retryable: boolean;
    public readonly model?: string;
    public readonly statusCode?: number;
    public readonly providerRequestId?: string;
    public readonly latencyMs?: number;

    public constructor(input: FakeProviderErrorInput) {
        super(input.message);
        this.name = "FakeProviderError";
        this.category = input.category;
        this.providerId = input.providerId;
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

export class FakeProviderAdapter implements ProviderAdapter {
    public readonly providerId: ProviderId;

    private readonly model: string;
    private readonly completionText: string;
    private readonly streamTokens: readonly string[];
    private readonly latencyMs: number;
    private readonly estimatedCostUsd: number;
    private mode: FakeProviderMode;
    private callCount = 0;

    public constructor(options: FakeProviderAdapterOptions = {}) {
        this.providerId = options.providerId ?? FAKE_PROVIDER_ID;
        this.model = options.model ?? FAKE_PROVIDER_DEFAULT_MODEL;
        this.mode = options.mode ?? "success";
        this.completionText =
            options.completionText ?? FAKE_PROVIDER_DEFAULT_COMPLETION;
        this.streamTokens = options.streamTokens ?? [
            "Fake ",
            "provider ",
            "response.",
        ];
        this.latencyMs = options.latencyMs ?? 25;
        this.estimatedCostUsd = options.estimatedCostUsd ?? 0;
    }

    public setMode(mode: FakeProviderMode): void {
        this.mode = mode;
    }

    public getCallCount(): number {
        return this.callCount;
    }

    public resetCallCount(): void {
        this.callCount = 0;
    }

    public async complete(
        request: CompletionRequest,
    ): Promise<CompletionResult> {
        this.callCount += 1;
        this.assertRequestMatchesAdapter(request);
        this.throwIfAborted(request);
        this.throwIfImmediateFailure(request);

        const usage = createUsage(request, this.completionText);

        return {
            providerId: this.providerId,
            model: request.model,
            outputText: this.completionText,
            finishReason: "stop",
            usage,
            latencyMs: this.latencyMs,
            estimatedCostUsd: this.estimatedCostUsd,
        };
    }

    public stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
        this.callCount += 1;
        this.assertRequestMatchesAdapter(request);
        this.throwIfAborted(request);

        return this.createStream(request);
    }

    public async checkHealth(): Promise<ProviderHealth> {
        return {
            providerId: this.providerId,
            status: this.mode === "success" ? "healthy" : "degraded",
            checkedAt: new Date(),
            latencyMs: this.latencyMs,
        };
    }

    public getCapabilities(): ProviderCapabilities {
        if (this.providerId === FAKE_PROVIDER_ID
            && this.model === FAKE_PROVIDER_MODEL_ID) {
            return getProviderCapabilities(FAKE_PROVIDER_ID);
        }

        return {
            providerId: this.providerId,
            supportedModels: [this.model],
            supportsStreaming: true,
            supportsNonStreaming: true,
            maxInputTokens: FAKE_MAX_INPUT_TOKENS,
            maxOutputTokens: FAKE_MAX_OUTPUT_TOKENS,
        };
    }

    private async *createStream(
        request: CompletionRequest,
    ): AsyncIterable<StreamChunk> {
        this.throwIfImmediateFailure(request);

        for (const [index, text] of this.streamTokens.entries()) {
            yield {
                type: "token",
                text,
            };

            if (this.mode === "mid_stream_failure" && index === 0) {
                throw this.createError(
                    "provider_error",
                    "Fake provider failed during streaming.",
                    true,
                    500,
                );
            }
        }

        yield {
            type: "done",
            finishReason: "stop",
            usage: createUsage(
                request,
                this.streamTokens.join(""),
            ),
            latencyMs: this.latencyMs,
            estimatedCostUsd: this.estimatedCostUsd,
        };
    }

    private assertRequestMatchesAdapter(
        request: CompletionRequest,
    ): void {
        if (request.providerId !== this.providerId) {
            throw this.createError(
                "invalid_request",
                "Completion request provider does not match adapter.",
                false,
                400,
            );
        }
    }

    private throwIfAborted(request: CompletionRequest): void {
        if (request.abortSignal?.aborted === true) {
            throw this.createError(
                "timeout",
                "Fake provider request was aborted.",
                true,
            );
        }
    }

    private throwIfImmediateFailure(
        request: CompletionRequest,
    ): void {
        if (this.mode === "success" || this.mode === "mid_stream_failure") {
            return;
        }

        const errorByMode: Record<
            Exclude<FakeProviderMode, "success" | "mid_stream_failure">,
            {
                category: ProviderErrorCategory;
                message: string;
                retryable: boolean;
                statusCode?: number;
            }
        > = {
            timeout: {
                category: "timeout",
                message: "Fake provider timed out.",
                retryable: true,
            },
            rate_limit: {
                category: "rate_limit",
                message: "Fake provider rate limit exceeded.",
                retryable: true,
                statusCode: 429,
            },
            server_error: {
                category: "provider_error",
                message: "Fake provider returned a server error.",
                retryable: true,
                statusCode: 500,
            },
        };

        const error = errorByMode[this.mode];

        throw this.createError(
            error.category,
            error.message,
            error.retryable,
            error.statusCode,
            request.model,
        );
    }

    private createError(
        category: ProviderErrorCategory,
        message: string,
        retryable: boolean,
        statusCode?: number,
        model = this.model,
    ): FakeProviderError {
        const input: FakeProviderErrorInput = {
            category,
            providerId: this.providerId,
            message,
            retryable,
            model,
            latencyMs: this.latencyMs,
        };

        if (statusCode !== undefined) {
            input.statusCode = statusCode;
        }

        return new FakeProviderError(input);
    }
}

function createUsage(
    request: CompletionRequest,
    outputText: string,
): TokenUsage {
    const inputTokens = estimateTokens(
        request.messages
            .map((message) => message.content)
            .join(" "),
    );
    const outputTokens = estimateTokens(outputText);

    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
    };
}

function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(Array.from(text).length / 4));
}
