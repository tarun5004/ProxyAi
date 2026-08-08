import {
    isProviderError,
    shouldRetryProviderError,
} from "./provider-retry.policy.js";
import type {
    ProviderError,
    ProviderErrorCategory,
    ProviderId,
} from "./provider.types.js";

export const PROVIDER_CIRCUIT_STATES = [
    "CLOSED",
    "OPEN",
    "HALF_OPEN",
] as const;

export const DEFAULT_PROVIDER_CIRCUIT_BREAKER_POLICY = Object.freeze({
    failureThreshold: 5,
    cooldownMs: 30_000,
    halfOpenMaxTrials: 1,
});

export type ProviderCircuitState =
    (typeof PROVIDER_CIRCUIT_STATES)[number];

export interface ProviderCircuitSnapshot {
    state: ProviderCircuitState;
    failureCount: number;
    openedAt?: number;
    lastFailureAt?: number;
    halfOpenTrialCount: number;
}

export interface ProviderCircuitBreakerPolicy {
    failureThreshold: number;
    cooldownMs: number;
    halfOpenMaxTrials: number;
}

export interface ProviderCircuitBreakerOptions {
    policy?: ProviderCircuitBreakerPolicy;
    now?: () => number;
}

interface ProviderCircuitRecord {
    state: ProviderCircuitState;
    failureCount: number;
    openedAt?: number;
    lastFailureAt?: number;
    halfOpenTrialCount: number;
}

export class ProviderCircuitOpenError
    extends Error
    implements ProviderError {
    public readonly isProviderError = true;
    public readonly category = "unavailable" satisfies ProviderErrorCategory;
    public readonly retryable = true;
    public readonly providerId: ProviderId;
    public readonly statusCode = 503;

    public constructor(providerId: ProviderId) {
        super("Provider circuit is open.");
        this.name = "ProviderCircuitOpenError";
        this.providerId = providerId;
    }
}

export class ProviderCircuitBreaker {
    private readonly policy: ProviderCircuitBreakerPolicy;
    private readonly now: () => number;
    private readonly recordsByProviderId = new Map<
        ProviderId,
        ProviderCircuitRecord
    >();

    public constructor(options: ProviderCircuitBreakerOptions = {}) {
        this.policy = options.policy
            ?? DEFAULT_PROVIDER_CIRCUIT_BREAKER_POLICY;
        this.now = options.now ?? Date.now;
        assertValidCircuitBreakerPolicy(this.policy);
    }

    public async execute<T>(
        providerId: ProviderId,
        operation: () => Promise<T>,
    ): Promise<T> {
        const record = this.prepareRequest(providerId);

        try {
            const result = await operation();
            this.recordSuccess(record);

            return result;
        } catch (error: unknown) {
            this.recordFailure(record, error);

            throw error;
        } finally {
            if (record.state === "HALF_OPEN"
                && record.halfOpenTrialCount > 0) {
                record.halfOpenTrialCount -= 1;
            }
        }
    }

    public getSnapshot(
        providerId: ProviderId,
    ): ProviderCircuitSnapshot {
        const record = this.getRecord(providerId);

        return createSnapshot(record);
    }

    public isOpen(providerId: ProviderId): boolean {
        const record = this.getRecord(providerId);

        return record.state === "OPEN"
            && !this.hasCooldownElapsed(record);
    }

    public reset(providerId?: ProviderId): void {
        if (providerId === undefined) {
            this.recordsByProviderId.clear();

            return;
        }

        this.recordsByProviderId.delete(providerId);
    }

    private prepareRequest(
        providerId: ProviderId,
    ): ProviderCircuitRecord {
        const record = this.getRecord(providerId);

        if (record.state === "OPEN") {
            if (this.hasCooldownElapsed(record)) {
                record.state = "HALF_OPEN";
                record.halfOpenTrialCount = 0;
            } else {
                throw new ProviderCircuitOpenError(providerId);
            }
        }

        if (record.state === "HALF_OPEN") {
            if (record.halfOpenTrialCount
                >= this.policy.halfOpenMaxTrials) {
                throw new ProviderCircuitOpenError(providerId);
            }

            record.halfOpenTrialCount += 1;
        }

        return record;
    }

    private recordSuccess(record: ProviderCircuitRecord): void {
        record.state = "CLOSED";
        record.failureCount = 0;
        record.halfOpenTrialCount = 0;
        delete record.openedAt;
        delete record.lastFailureAt;
    }

    private recordFailure(
        record: ProviderCircuitRecord,
        error: unknown,
    ): void {
        if (!shouldCountCircuitFailure(error)) {
            return;
        }

        record.lastFailureAt = this.now();

        if (record.state === "HALF_OPEN") {
            this.openCircuit(record);

            return;
        }

        record.failureCount += 1;

        if (record.failureCount >= this.policy.failureThreshold) {
            this.openCircuit(record);
        }
    }

    private openCircuit(record: ProviderCircuitRecord): void {
        record.state = "OPEN";
        record.openedAt = this.now();
        record.halfOpenTrialCount = 0;
    }

    private hasCooldownElapsed(record: ProviderCircuitRecord): boolean {
        return record.openedAt !== undefined
            && this.now() - record.openedAt >= this.policy.cooldownMs;
    }

    private getRecord(providerId: ProviderId): ProviderCircuitRecord {
        const existingRecord = this.recordsByProviderId.get(providerId);

        if (existingRecord) {
            return existingRecord;
        }

        const record: ProviderCircuitRecord = {
            state: "CLOSED",
            failureCount: 0,
            halfOpenTrialCount: 0,
        };

        this.recordsByProviderId.set(providerId, record);

        return record;
    }
}

export function shouldCountCircuitFailure(error: unknown): boolean {
    return isProviderError(error)
        && shouldRetryProviderError(error);
}

function createSnapshot(
    record: ProviderCircuitRecord,
): ProviderCircuitSnapshot {
    const snapshot: ProviderCircuitSnapshot = {
        state: record.state,
        failureCount: record.failureCount,
        halfOpenTrialCount: record.halfOpenTrialCount,
    };

    if (record.openedAt !== undefined) {
        snapshot.openedAt = record.openedAt;
    }

    if (record.lastFailureAt !== undefined) {
        snapshot.lastFailureAt = record.lastFailureAt;
    }

    return snapshot;
}

function assertValidCircuitBreakerPolicy(
    policy: ProviderCircuitBreakerPolicy,
): void {
    if (!Number.isSafeInteger(policy.failureThreshold)
        || policy.failureThreshold < 1
        || !Number.isSafeInteger(policy.cooldownMs)
        || policy.cooldownMs < 1
        || !Number.isSafeInteger(policy.halfOpenMaxTrials)
        || policy.halfOpenMaxTrials < 1) {
        throw new Error("Invalid provider circuit breaker policy.");
    }
}
