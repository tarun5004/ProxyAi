import type { ProviderAdapter } from "./provider-adapter.js";
import {
    ProviderCircuitBreaker,
} from "./provider-circuit-breaker.js";
import {
    DEFAULT_PROVIDER_RETRY_POLICY,
    isProviderError,
    retryProviderOperation,
    type ProviderRetryOptions,
    type ProviderRetryPolicy,
} from "./provider-retry.policy.js";
import type {
    CompletionRequest,
    CompletionResult,
    ProviderError,
    ProviderErrorCategory,
    ProviderId,
    StreamChunk,
} from "./provider.types.js";

export const defaultProviderFallbackCircuitBreaker =
    new ProviderCircuitBreaker();

export type ProviderFallbackAttemptStatus =
    | "succeeded"
    | "failed"
    | "skipped_open_circuit";

export type ProviderFallbackEventType =
    | "provider.fallback_candidate_succeeded"
    | "provider.fallback_candidate_failed"
    | "provider.fallback_candidate_skipped"
    | "provider.fallback_all_unavailable";

export interface ProviderFallbackCandidate {
    adapter: ProviderAdapter;
    model: string;
}

export interface ProviderFallbackAttemptMetadata {
    providerId: ProviderId;
    model: string;
    status: ProviderFallbackAttemptStatus;
    attemptNumber: number;
    errorCategory?: ProviderErrorCategory;
    statusCode?: number;
}

export interface ProviderFallbackMetadata {
    requestId: string;
    selectedProviderId?: ProviderId;
    selectedModel?: string;
    attempts: readonly ProviderFallbackAttemptMetadata[];
}

export interface ProviderFallbackEvent {
    type: ProviderFallbackEventType;
    requestId: string;
    providerId?: ProviderId;
    model?: string;
    attemptNumber?: number;
    errorCategory?: ProviderErrorCategory;
    statusCode?: number;
}

export interface ProviderFallbackOptions {
    circuitBreaker?: ProviderCircuitBreaker;
    retryPolicy?: ProviderRetryPolicy;
    calculateJitterMs?: (maxJitterMs: number) => number;
    sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
    recordEvent?: (event: ProviderFallbackEvent) => void;
}

export interface ProviderFallbackCompletionResult {
    result: CompletionResult;
    metadata: ProviderFallbackMetadata;
}

type ProviderFallbackBaseRequest =
    Omit<CompletionRequest, "providerId" | "model">;

interface StreamStart {
    iterator: AsyncIterator<StreamChunk>;
    firstResult: IteratorResult<StreamChunk>;
}

interface AllProvidersUnavailableErrorInput {
    providerId: ProviderId;
    requestId: string;
    attempts: readonly ProviderFallbackAttemptMetadata[];
}

export class AllProvidersUnavailableError
    extends Error
    implements ProviderError {
    public readonly isProviderError = true;
    public readonly category = "unavailable" satisfies ProviderErrorCategory;
    public readonly retryable = true;
    public readonly providerId: ProviderId;
    public readonly statusCode = 503;
    public readonly requestId: string;
    public readonly attempts: readonly ProviderFallbackAttemptMetadata[];

    public constructor(input: AllProvidersUnavailableErrorInput) {
        super("All ordered providers are unavailable.");
        this.name = "AllProvidersUnavailableError";
        this.providerId = input.providerId;
        this.requestId = input.requestId;
        this.attempts = Object.freeze([...input.attempts]);
    }
}

export async function completeWithOrderedFallback(
    request: ProviderFallbackBaseRequest,
    candidates: readonly ProviderFallbackCandidate[],
    options: ProviderFallbackOptions = {},
): Promise<ProviderFallbackCompletionResult> {
    assertHasCandidates(candidates);

    const attempts: ProviderFallbackAttemptMetadata[] = [];
    const circuitBreaker = options.circuitBreaker
        ?? defaultProviderFallbackCircuitBreaker;

    for (const [index, candidate] of candidates.entries()) {
        if (skipOpenCircuitCandidate(
            request.requestId,
            candidate,
            index + 1,
            attempts,
            circuitBreaker,
            options,
        )) {
            continue;
        }

        try {
            const result = await retryProviderOperation(
                () => circuitBreaker.execute(
                    candidate.adapter.providerId,
                    () => candidate.adapter.complete(
                        createCandidateRequest(request, candidate),
                    ),
                ),
                createRetryOptions(request, candidate, options),
            );

            recordSucceededAttempt(
                request.requestId,
                candidate,
                index + 1,
                attempts,
                options,
            );

            return {
                result,
                metadata: createMetadata(
                    request.requestId,
                    attempts,
                    candidate,
                ),
            };
        } catch (error: unknown) {
            recordFailedAttempt(
                request.requestId,
                candidate,
                index + 1,
                error,
                attempts,
                options,
            );
        }
    }

    throw createAllProvidersUnavailableError(
        request.requestId,
        candidates,
        attempts,
        options,
    );
}

export function streamWithOrderedFallback(
    request: ProviderFallbackBaseRequest,
    candidates: readonly ProviderFallbackCandidate[],
    options: ProviderFallbackOptions = {},
): AsyncIterable<StreamChunk> {
    assertHasCandidates(candidates);

    return createFallbackStream(request, candidates, options);
}

async function* createFallbackStream(
    request: ProviderFallbackBaseRequest,
    candidates: readonly ProviderFallbackCandidate[],
    options: ProviderFallbackOptions,
): AsyncIterable<StreamChunk> {
    const attempts: ProviderFallbackAttemptMetadata[] = [];
    const circuitBreaker = options.circuitBreaker
        ?? defaultProviderFallbackCircuitBreaker;

    for (const [index, candidate] of candidates.entries()) {
        if (skipOpenCircuitCandidate(
            request.requestId,
            candidate,
            index + 1,
            attempts,
            circuitBreaker,
            options,
        )) {
            continue;
        }

        let streamStart: StreamStart;

        try {
            streamStart = await retryProviderOperation(
                () => circuitBreaker.execute(
                    candidate.adapter.providerId,
                    () => startProviderStream(request, candidate),
                ),
                createRetryOptions(request, candidate, options),
            );
        } catch (error: unknown) {
            recordFailedAttempt(
                request.requestId,
                candidate,
                index + 1,
                error,
                attempts,
                options,
            );
            continue;
        }

        recordSucceededAttempt(
            request.requestId,
            candidate,
            index + 1,
            attempts,
            options,
        );

        if (!streamStart.firstResult.done) {
            yield streamStart.firstResult.value;
        }

        while (true) {
            const nextResult = await streamStart.iterator.next();

            if (nextResult.done === true) {
                return;
            }

            yield nextResult.value;
        }
    }

    throw createAllProvidersUnavailableError(
        request.requestId,
        candidates,
        attempts,
        options,
    );
}

async function startProviderStream(
    request: ProviderFallbackBaseRequest,
    candidate: ProviderFallbackCandidate,
): Promise<StreamStart> {
    const iterator = candidate.adapter
        .stream(createCandidateRequest(request, candidate))
        [Symbol.asyncIterator]();
    const firstResult = await iterator.next();

    return {
        iterator,
        firstResult,
    };
}

function skipOpenCircuitCandidate(
    requestId: string,
    candidate: ProviderFallbackCandidate,
    attemptNumber: number,
    attempts: ProviderFallbackAttemptMetadata[],
    circuitBreaker: ProviderCircuitBreaker,
    options: ProviderFallbackOptions,
): boolean {
    if (!circuitBreaker.isOpen(candidate.adapter.providerId)) {
        return false;
    }

    const attempt: ProviderFallbackAttemptMetadata = {
        providerId: candidate.adapter.providerId,
        model: candidate.model,
        status: "skipped_open_circuit",
        attemptNumber,
        errorCategory: "unavailable",
        statusCode: 503,
    };

    attempts.push(attempt);
    const event: ProviderFallbackEvent = {
        type: "provider.fallback_candidate_skipped",
        requestId,
        providerId: attempt.providerId,
        model: attempt.model,
        attemptNumber,
    };

    if (attempt.errorCategory !== undefined) {
        event.errorCategory = attempt.errorCategory;
    }

    if (attempt.statusCode !== undefined) {
        event.statusCode = attempt.statusCode;
    }

    recordEvent(options, event);

    return true;
}

function recordSucceededAttempt(
    requestId: string,
    candidate: ProviderFallbackCandidate,
    attemptNumber: number,
    attempts: ProviderFallbackAttemptMetadata[],
    options: ProviderFallbackOptions,
): void {
    const attempt: ProviderFallbackAttemptMetadata = {
        providerId: candidate.adapter.providerId,
        model: candidate.model,
        status: "succeeded",
        attemptNumber,
    };

    attempts.push(attempt);
    recordEvent(options, {
        type: "provider.fallback_candidate_succeeded",
        requestId,
        providerId: attempt.providerId,
        model: attempt.model,
        attemptNumber,
    });
}

function recordFailedAttempt(
    requestId: string,
    candidate: ProviderFallbackCandidate,
    attemptNumber: number,
    error: unknown,
    attempts: ProviderFallbackAttemptMetadata[],
    options: ProviderFallbackOptions,
): void {
    const attempt = createFailedAttempt(candidate, attemptNumber, error);

    attempts.push(attempt);
    const event: ProviderFallbackEvent = {
        type: "provider.fallback_candidate_failed",
        requestId,
        providerId: attempt.providerId,
        model: attempt.model,
        attemptNumber,
    };

    if (attempt.errorCategory !== undefined) {
        event.errorCategory = attempt.errorCategory;
    }

    if (attempt.statusCode !== undefined) {
        event.statusCode = attempt.statusCode;
    }

    recordEvent(options, event);
}

function createFailedAttempt(
    candidate: ProviderFallbackCandidate,
    attemptNumber: number,
    error: unknown,
): ProviderFallbackAttemptMetadata {
    const attempt: ProviderFallbackAttemptMetadata = {
        providerId: candidate.adapter.providerId,
        model: candidate.model,
        status: "failed",
        attemptNumber,
    };

    if (isProviderError(error)) {
        attempt.errorCategory = error.category;

        if (error.statusCode !== undefined) {
            attempt.statusCode = error.statusCode;
        }
    } else {
        attempt.errorCategory = "provider_error";
    }

    return attempt;
}

function createAllProvidersUnavailableError(
    requestId: string,
    candidates: readonly ProviderFallbackCandidate[],
    attempts: readonly ProviderFallbackAttemptMetadata[],
    options: ProviderFallbackOptions,
): AllProvidersUnavailableError {
    const lastCandidate = candidates[candidates.length - 1];

    if (lastCandidate === undefined) {
        throw new Error("Provider fallback requires at least one candidate.");
    }

    const error = new AllProvidersUnavailableError({
        providerId: lastCandidate.adapter.providerId,
        requestId,
        attempts,
    });

    recordEvent(options, {
        type: "provider.fallback_all_unavailable",
        requestId,
        providerId: error.providerId,
        errorCategory: error.category,
        statusCode: error.statusCode,
    });

    return error;
}

function createCandidateRequest(
    request: ProviderFallbackBaseRequest,
    candidate: ProviderFallbackCandidate,
): CompletionRequest {
    return {
        ...request,
        providerId: candidate.adapter.providerId,
        model: candidate.model,
    };
}

function createMetadata(
    requestId: string,
    attempts: readonly ProviderFallbackAttemptMetadata[],
    selectedCandidate: ProviderFallbackCandidate,
): ProviderFallbackMetadata {
    return {
        requestId,
        selectedProviderId: selectedCandidate.adapter.providerId,
        selectedModel: selectedCandidate.model,
        attempts: Object.freeze([...attempts]),
    };
}

function createRetryOptions(
    request: ProviderFallbackBaseRequest,
    candidate: ProviderFallbackCandidate,
    options: ProviderFallbackOptions,
): ProviderRetryOptions {
    const retryOptions: ProviderRetryOptions = {
        providerId: candidate.adapter.providerId,
        model: candidate.model,
        policy: options.retryPolicy ?? DEFAULT_PROVIDER_RETRY_POLICY,
    };

    if (request.abortSignal !== undefined) {
        retryOptions.signal = request.abortSignal;
    }

    if (options.calculateJitterMs !== undefined) {
        retryOptions.calculateJitterMs = options.calculateJitterMs;
    }

    if (options.sleep !== undefined) {
        retryOptions.sleep = options.sleep;
    }

    return retryOptions;
}

function recordEvent(
    options: ProviderFallbackOptions,
    event: ProviderFallbackEvent,
): void {
    options.recordEvent?.(event);
}

function assertHasCandidates(
    candidates: readonly ProviderFallbackCandidate[],
): void {
    if (candidates.length === 0) {
        throw new Error("Provider fallback requires at least one candidate.");
    }
}
