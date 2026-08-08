import { env } from "../../config/env.js";
import type {
    ProviderCapabilities,
    ProviderError,
    ProviderErrorCategory,
    ProviderId,
} from "./provider.types.js";

export const GROQ_PROVIDER_ID = "groq" satisfies ProviderId;
export const FAKE_PROVIDER_ID = "third" satisfies ProviderId;

export const FAKE_PROVIDER_MODEL_ID = "fake-model";
export const GROQ_MAX_INPUT_TOKENS = 20_000;
export const GROQ_MAX_OUTPUT_TOKENS = 4_096;
export const FAKE_MAX_INPUT_TOKENS = 20_000;
export const FAKE_MAX_OUTPUT_TOKENS = 4_096;

export interface ProviderModelCapability {
    providerId: ProviderId;
    model: string;
    supportsStreaming: boolean;
    supportsNonStreaming: boolean;
    maxInputTokens: number;
    maxOutputTokens: number;
}

export interface ProviderRegistryEntry extends ProviderCapabilities {
    models: readonly ProviderModelCapability[];
}

export interface ProviderCapabilityRegistry extends Iterable<
    [ProviderId, ProviderRegistryEntry]
> {
    readonly size: number;
    get(key: ProviderId): ProviderRegistryEntry | undefined;
    has(key: ProviderId): boolean;
    entries(): IterableIterator<[ProviderId, ProviderRegistryEntry]>;
    keys(): IterableIterator<ProviderId>;
    values(): IterableIterator<ProviderRegistryEntry>;
    forEach(
        callbackfn: (
            value: ProviderRegistryEntry,
            key: ProviderId,
            registry: ProviderCapabilityRegistry,
        ) => void,
        thisArg?: unknown,
    ): void;
}

class ReadonlyProviderCapabilityRegistry
    implements ProviderCapabilityRegistry {
    private readonly entriesByProviderId: ReadonlyMap<
        ProviderId,
        ProviderRegistryEntry
    >;

    public constructor(
        entries: readonly [
            ProviderId,
            ProviderRegistryEntry,
        ][],
    ) {
        this.entriesByProviderId = new Map(entries);
        Object.freeze(this);
    }

    public get size(): number {
        return this.entriesByProviderId.size;
    }

    public get(
        key: ProviderId,
    ): ProviderRegistryEntry | undefined {
        return this.entriesByProviderId.get(key);
    }

    public has(key: ProviderId): boolean {
        return this.entriesByProviderId.has(key);
    }

    public entries(): IterableIterator<
        [ProviderId, ProviderRegistryEntry]
    > {
        return this.entriesByProviderId.entries();
    }

    public keys(): IterableIterator<ProviderId> {
        return this.entriesByProviderId.keys();
    }

    public values(): IterableIterator<ProviderRegistryEntry> {
        return this.entriesByProviderId.values();
    }

    public forEach(
        callbackfn: (
            value: ProviderRegistryEntry,
            key: ProviderId,
            registry: ProviderCapabilityRegistry,
        ) => void,
        thisArg?: unknown,
    ): void {
        this.entriesByProviderId.forEach((value, key) => {
            callbackfn.call(thisArg, value, key, this);
        });
    }

    public [Symbol.iterator](): IterableIterator<
        [ProviderId, ProviderRegistryEntry]
    > {
        return this.entries();
    }
}

interface ProviderRegistryErrorInput {
    category: ProviderErrorCategory;
    providerId: ProviderId;
    message: string;
    retryable: boolean;
    model?: string;
    statusCode?: number;
}

export class ProviderRegistryError
    extends Error
    implements ProviderError {
    public readonly isProviderError = true;
    public readonly category: ProviderErrorCategory;
    public readonly providerId: ProviderId;
    public readonly retryable: boolean;
    public readonly model?: string;
    public readonly statusCode?: number;

    public constructor(input: ProviderRegistryErrorInput) {
        super(input.message);
        this.name = "ProviderRegistryError";
        this.category = input.category;
        this.providerId = input.providerId;
        this.retryable = input.retryable;

        if (input.model !== undefined) {
            this.model = input.model;
        }

        if (input.statusCode !== undefined) {
            this.statusCode = input.statusCode;
        }
    }
}

export function createProviderCapabilityRegistry(
    configuredGroqModel: string,
): ProviderCapabilityRegistry {
    const groqEntry = createRegistryEntry({
        providerId: GROQ_PROVIDER_ID,
        models: [
            {
                providerId: GROQ_PROVIDER_ID,
                model: configuredGroqModel,
                supportsStreaming: true,
                supportsNonStreaming: true,
                maxInputTokens: GROQ_MAX_INPUT_TOKENS,
                maxOutputTokens: GROQ_MAX_OUTPUT_TOKENS,
            },
        ],
    });

    const fakeEntry = createRegistryEntry({
        providerId: FAKE_PROVIDER_ID,
        models: [
            {
                providerId: FAKE_PROVIDER_ID,
                model: FAKE_PROVIDER_MODEL_ID,
                supportsStreaming: true,
                supportsNonStreaming: true,
                maxInputTokens: FAKE_MAX_INPUT_TOKENS,
                maxOutputTokens: FAKE_MAX_OUTPUT_TOKENS,
            },
        ],
    });

    return new ReadonlyProviderCapabilityRegistry([
        [GROQ_PROVIDER_ID, groqEntry],
        [FAKE_PROVIDER_ID, fakeEntry],
    ]);
}

export const providerCapabilityRegistry =
    createProviderCapabilityRegistry(env.GROQ_MODEL);

export function getProviderCapabilities(
    providerId: ProviderId,
    registry = providerCapabilityRegistry,
): ProviderRegistryEntry {
    const capabilities = registry.get(providerId);

    if (!capabilities) {
        throw createUnsupportedProviderError(providerId);
    }

    return capabilities;
}

export function getProviderModelCapability(
    providerId: ProviderId,
    model: string,
    registry = providerCapabilityRegistry,
): ProviderModelCapability {
    const capabilities = getProviderCapabilities(providerId, registry);
    const modelCapability = capabilities.models.find(
        (entry) => entry.model === model,
    );

    if (!modelCapability) {
        throw createUnsupportedModelError(providerId, model);
    }

    return modelCapability;
}

function createRegistryEntry(input: {
    providerId: ProviderId;
    models: readonly ProviderModelCapability[];
}): ProviderRegistryEntry {
    const models = Object.freeze(
        input.models.map((model) => Object.freeze({ ...model })),
    );
    const firstModel = models[0];

    if (!firstModel) {
        throw createUnsupportedProviderError(input.providerId);
    }

    return Object.freeze({
        providerId: input.providerId,
        supportedModels: Object.freeze(
            models.map((model) => model.model),
        ),
        supportsStreaming: models.some((model) => model.supportsStreaming),
        supportsNonStreaming: models.some(
            (model) => model.supportsNonStreaming,
        ),
        maxInputTokens: Math.max(
            ...models.map((model) => model.maxInputTokens),
        ),
        maxOutputTokens: Math.max(
            ...models.map((model) => model.maxOutputTokens),
        ),
        models,
    });
}

function createUnsupportedProviderError(
    providerId: ProviderId,
): ProviderRegistryError {
    return new ProviderRegistryError({
        category: "invalid_request",
        providerId,
        message: "Unsupported provider.",
        retryable: false,
        statusCode: 400,
    });
}

function createUnsupportedModelError(
    providerId: ProviderId,
    model: string,
): ProviderRegistryError {
    return new ProviderRegistryError({
        category: "invalid_request",
        providerId,
        message: "Unsupported provider model.",
        retryable: false,
        model,
        statusCode: 400,
    });
}
