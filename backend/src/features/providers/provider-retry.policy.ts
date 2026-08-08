import type {
    ProviderError,
    ProviderErrorCategory,
    ProviderId,
} from "./provider.types.js";

export const DEFAULT_PROVIDER_RETRY_POLICY = Object.freeze({
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 4_000,
    maxJitterMs: 250,
});

const TRANSIENT_PROVIDER_STATUS_CODES = new Set([
    500,
    502,
    503,
    504,
]);

export interface ProviderRetryPolicy {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    maxJitterMs: number;
}

export interface ProviderRetryOptions {
    providerId: ProviderId;
    model?: string;
    policy?: ProviderRetryPolicy;
    signal?: AbortSignal;
    calculateJitterMs?: (maxJitterMs: number) => number;
    sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export interface ProviderRetryAttempt {
    attempt: number;
}

export class ProviderRetryAbortedError
    extends Error
    implements ProviderError {
    public readonly isProviderError = true;
    public readonly category = "timeout" satisfies ProviderErrorCategory;
    public readonly retryable = false;
    public readonly providerId: ProviderId;
    public readonly model?: string;

    public constructor(providerId: ProviderId, model?: string) {
        super("Provider retry was aborted.");
        this.name = "ProviderRetryAbortedError";
        this.providerId = providerId;

        if (model !== undefined) {
            this.model = model;
        }
    }
}

export async function retryProviderOperation<T>(
    operation: (attempt: ProviderRetryAttempt) => Promise<T>,
    options: ProviderRetryOptions,
): Promise<T> {
    const policy = options.policy ?? DEFAULT_PROVIDER_RETRY_POLICY;

    assertValidRetryPolicy(policy);

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
        throwIfAborted(options);

        try {
            return await operation({ attempt });
        } catch (error: unknown) {
            if (!isProviderError(error)
                || !shouldRetryProviderError(error)
                || attempt >= policy.maxAttempts) {
                throw error;
            }

            const delayMs = calculateRetryDelayMs(
                attempt,
                policy,
                options.calculateJitterMs,
            );

            await waitForRetryDelay(delayMs, options);
        }
    }

    throw new ProviderRetryAbortedError(
        options.providerId,
        options.model,
    );
}

export function isProviderError(error: unknown): error is ProviderError {
    return typeof error === "object"
        && error !== null
        && "isProviderError" in error
        && (error as { isProviderError?: unknown }).isProviderError === true;
}

export function shouldRetryProviderError(
    error: ProviderError,
): boolean {
    if (!error.retryable) {
        return false;
    }

    if (error.category === "authentication"
        || error.category === "invalid_request") {
        return false;
    }

    if (error.category === "timeout"
        || error.category === "rate_limit"
        || error.statusCode === 429
        || error.category === "unavailable") {
        return true;
    }

    return error.category === "provider_error"
        && error.statusCode !== undefined
        && TRANSIENT_PROVIDER_STATUS_CODES.has(error.statusCode);
}

export function calculateRetryDelayMs(
    failedAttempt: number,
    policy: ProviderRetryPolicy = DEFAULT_PROVIDER_RETRY_POLICY,
    calculateJitterMs = defaultJitterMs,
): number {
    assertValidRetryPolicy(policy);

    const exponentialDelayMs = Math.min(
        policy.baseDelayMs * 2 ** (failedAttempt - 1),
        policy.maxDelayMs,
    );
    const jitterMs = clampJitterMs(
        calculateJitterMs(policy.maxJitterMs),
        policy.maxJitterMs,
    );

    return exponentialDelayMs + jitterMs;
}

function defaultJitterMs(maxJitterMs: number): number {
    return Math.floor(Math.random() * maxJitterMs);
}

function clampJitterMs(
    jitterMs: number,
    maxJitterMs: number,
): number {
    if (!Number.isFinite(jitterMs)) {
        return 0;
    }

    return Math.max(0, Math.min(Math.floor(jitterMs), maxJitterMs));
}

function assertValidRetryPolicy(policy: ProviderRetryPolicy): void {
    if (!Number.isSafeInteger(policy.maxAttempts)
        || policy.maxAttempts < 1
        || !Number.isSafeInteger(policy.baseDelayMs)
        || policy.baseDelayMs < 0
        || !Number.isSafeInteger(policy.maxDelayMs)
        || policy.maxDelayMs < policy.baseDelayMs
        || !Number.isSafeInteger(policy.maxJitterMs)
        || policy.maxJitterMs < 0) {
        throw new Error("Invalid provider retry policy.");
    }
}

async function waitForRetryDelay(
    delayMs: number,
    options: ProviderRetryOptions,
): Promise<void> {
    throwIfAborted(options);

    try {
        await (options.sleep ?? sleep)(delayMs, options.signal);
    } catch {
        throw new ProviderRetryAbortedError(
            options.providerId,
            options.model,
        );
    }

    throwIfAborted(options);
}

function sleep(
    delayMs: number,
    signal?: AbortSignal,
): Promise<void> {
    if (signal?.aborted === true) {
        return Promise.reject(new Error("aborted"));
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, delayMs);

        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timeout);
                reject(new Error("aborted"));
            },
            { once: true },
        );
    });
}

function throwIfAborted(options: ProviderRetryOptions): void {
    if (options.signal?.aborted === true) {
        throw new ProviderRetryAbortedError(
            options.providerId,
            options.model,
        );
    }
}
