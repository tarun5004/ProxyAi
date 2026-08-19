import { runtimeEnv } from "../../config/runtime-env.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import type { ProviderFallbackCandidate } from "./provider-fallback.js";
import { createGroqProviderAdapter } from "./groq-provider.adapter.js";
import {
    ENABLED_PRODUCTION_PROVIDER_IDS,
    type EnabledProductionProviderId,
} from "./provider.types.js";

const adapters = new Map<EnabledProductionProviderId, ProviderAdapter>([
    ["groq", createGroqProviderAdapter()],
]);

export const productionProviderCandidates = Object.freeze([
    Object.freeze({
        adapter: getEnabledProductionProviderAdapter("groq"),
        model: runtimeEnv.GROQ_MODEL,
    }),
] satisfies readonly ProviderFallbackCandidate[]);

export function getEnabledProductionProviderAdapter(
    providerId: EnabledProductionProviderId,
): ProviderAdapter {
    const adapter = adapters.get(providerId);

    if (adapter === undefined) {
        throw new Error("Enabled production provider adapter is unavailable.");
    }

    return adapter;
}

export function getEnabledProductionProviderIds(): readonly EnabledProductionProviderId[] {
    return ENABLED_PRODUCTION_PROVIDER_IDS;
}
