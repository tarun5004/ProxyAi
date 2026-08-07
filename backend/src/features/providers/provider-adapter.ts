import type {
    CompletionRequest,
    CompletionResult,
    ProviderCapabilities,
    ProviderHealth,
    ProviderId,
    StreamChunk,
} from "./provider.types.js";

export interface ProviderAdapter {
    readonly providerId: ProviderId;

    complete(request: CompletionRequest): Promise<CompletionResult>;

    stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

    checkHealth(): Promise<ProviderHealth>;

    getCapabilities(): ProviderCapabilities;
}
