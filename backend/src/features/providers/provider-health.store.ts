import { z } from "zod";

import { logger } from "../../shared/lib/logger.js";
import { redis } from "../../shared/lib/redis.js";
import type {
    ProviderHealthStatus,
    ProviderId,
} from "./provider.types.js";

export const PROVIDER_HEALTH_TTL_SECONDS = 120;
export const PROVIDER_HEALTH_STATES = [
    "HEALTHY",
    "UNHEALTHY",
    "UNKNOWN",
] as const;

export type ProviderHealthState =
    (typeof PROVIDER_HEALTH_STATES)[number];

export interface ProviderHealthRecord {
    readonly state: ProviderHealthState;
    readonly checkedAt?: string;
}

export interface ProviderHealthRedisClient {
    get(key: string): Promise<string | null>;
    set(
        key: string,
        value: string,
        expirationMode: "EX",
        ttlSeconds: number,
    ): Promise<unknown>;
}

const storedProviderHealthSchema = z.strictObject({
    state: z.enum(PROVIDER_HEALTH_STATES),
    checkedAt: z.string().datetime(),
});

export function createProviderHealthKey(providerId: ProviderId): string {
    return `health:${providerId}`;
}

export function mapProviderHealthStatus(
    status: ProviderHealthStatus,
): ProviderHealthState {
    switch (status) {
        case "healthy":
            return "HEALTHY";
        case "degraded":
            return "UNKNOWN";
        case "unhealthy":
            return "UNHEALTHY";
    }
}

export async function writeProviderHealth(
    providerId: ProviderId,
    record: Required<ProviderHealthRecord>,
    client: ProviderHealthRedisClient = redis,
): Promise<void> {
    await client.set(
        createProviderHealthKey(providerId),
        JSON.stringify(record),
        "EX",
        PROVIDER_HEALTH_TTL_SECONDS,
    );
}

export async function readProviderHealth(
    providerId: ProviderId,
    client: ProviderHealthRedisClient = redis,
): Promise<ProviderHealthRecord> {
    let storedValue: string | null;

    try {
        storedValue = await client.get(createProviderHealthKey(providerId));
    } catch {
        logger.warn(
            {
                event: "provider.health.read_failed",
                providerId,
            },
            "Provider health state unavailable",
        );

        return Object.freeze({ state: "UNKNOWN" });
    }

    if (storedValue === null) {
        return Object.freeze({ state: "UNKNOWN" });
    }

    try {
        const result = storedProviderHealthSchema.safeParse(
            JSON.parse(storedValue) as unknown,
        );

        if (!result.success) {
            return Object.freeze({ state: "UNKNOWN" });
        }

        return Object.freeze(result.data);
    } catch {
        return Object.freeze({ state: "UNKNOWN" });
    }
}
