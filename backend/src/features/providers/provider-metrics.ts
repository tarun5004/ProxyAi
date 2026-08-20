import { metrics } from "../../shared/observability/metrics.js";
import {
    ENABLED_PRODUCTION_PROVIDER_IDS,
    type ProviderErrorCategory,
    type ProviderId,
} from "./provider.types.js";
import type { ProviderCircuitState } from "./provider-circuit-breaker.js";
import type { ProviderHealthState } from "./provider-health.store.js";

type ProviderOutcome = "succeeded" | "failed" | "interrupted";
type ProviderRetryOutcome = "scheduled" | "exhausted";
type ProviderFallbackOutcome =
    | "attempted"
    | "succeeded"
    | "failed"
    | "all_unavailable"
    | "skipped_open_circuit";

export function recordProviderExecution(
    providerId: ProviderId,
    outcome: ProviderOutcome,
    durationMs: number,
    errorCategory?: ProviderErrorCategory,
): void {
    if (!isEnabledProvider(providerId)) {
        return;
    }

    metrics.providerRequestsTotal.inc({ provider: providerId, outcome });
    metrics.providerRequestDurationSeconds.observe(
        { provider: providerId, outcome },
        Math.max(0, durationMs) / 1_000,
    );

    if (outcome === "failed" && errorCategory !== undefined) {
        metrics.providerErrorsTotal.inc({
            provider: providerId,
            error_category: errorCategory,
        });
    }
}

export function recordProviderRetry(
    providerId: ProviderId,
    errorCategory: ProviderErrorCategory,
    outcome: ProviderRetryOutcome,
): void {
    if (!isEnabledProvider(providerId)) {
        return;
    }

    metrics.providerRetriesTotal.inc({
        provider: providerId,
        error_category: errorCategory,
        outcome,
    });
}

export function recordProviderFallback(
    providerId: ProviderId,
    outcome: ProviderFallbackOutcome,
): void {
    if (!isEnabledProvider(providerId)) {
        return;
    }

    metrics.providerFallbacksTotal.inc({ provider: providerId, outcome });
}

export function recordProviderCircuitState(
    providerId: ProviderId,
    state: ProviderCircuitState,
): void {
    if (!isEnabledProvider(providerId)) {
        return;
    }

    for (const candidateState of ["CLOSED", "OPEN", "HALF_OPEN"] as const) {
        metrics.providerCircuitState.set(
            { provider: providerId, state: candidateState },
            candidateState === state ? 1 : 0,
        );
    }
}

export function recordProviderCircuitTransition(
    providerId: ProviderId,
    fromState: ProviderCircuitState,
    toState: ProviderCircuitState,
): void {
    if (!isEnabledProvider(providerId) || fromState === toState) {
        return;
    }

    metrics.providerCircuitTransitionsTotal.inc({
        provider: providerId,
        from_state: fromState,
        to_state: toState,
    });
    recordProviderCircuitState(providerId, toState);
}

export function recordProviderHealthState(
    providerId: ProviderId,
    state: ProviderHealthState,
): void {
    if (!isEnabledProvider(providerId)) {
        return;
    }

    for (const candidateState of ["HEALTHY", "UNHEALTHY", "UNKNOWN"] as const) {
        metrics.providerHealthState.set(
            { provider: providerId, state: candidateState },
            candidateState === state ? 1 : 0,
        );
    }
}

function isEnabledProvider(providerId: ProviderId): boolean {
    return ENABLED_PRODUCTION_PROVIDER_IDS.some(
        (enabledProviderId) => enabledProviderId === providerId,
    );
}
