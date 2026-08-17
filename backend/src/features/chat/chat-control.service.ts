import { createHmac } from "node:crypto";

import { z } from "zod";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { redis } from "../../shared/lib/redis.js";
import type { OrganisationPlan } from "../organisations/organisation.types.js";

export const CHAT_IDEMPOTENCY_TTL_MS = 5 * 60 * 1_000;
export const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 1_000;

export const CHAT_RATE_LIMITS = Object.freeze({
    FREE: Object.freeze({
        userRpm: env.CHAT_RATE_LIMIT_FREE_USER_RPM,
        organisationRpm: env.CHAT_RATE_LIMIT_FREE_ORG_RPM,
    }),
    PRO: Object.freeze({
        userRpm: env.CHAT_RATE_LIMIT_PRO_USER_RPM,
        organisationRpm: env.CHAT_RATE_LIMIT_PRO_ORG_RPM,
    }),
    ENTERPRISE: Object.freeze({
        userRpm: env.CHAT_RATE_LIMIT_ENTERPRISE_USER_RPM,
        organisationRpm: env.CHAT_RATE_LIMIT_ENTERPRISE_ORG_RPM,
    }),
} satisfies Record<OrganisationPlan, ChatRateLimitPair>);

interface ChatRateLimitPair {
    readonly userRpm: number;
    readonly organisationRpm: number;
}

const controlSecret = Buffer.from(
    env.AUTH_RATE_LIMIT_SECRET,
    "base64url",
);
const reservationResultSchema = z.enum([
    "reserved",
    "processing",
    "completed",
]);
const rateResultSchema = z.tuple([
    z.coerce.number().int().min(1),
    z.coerce.number().int(),
    z.coerce.number().int().min(1),
    z.coerce.number().int(),
]);

const RESERVE_SCRIPT = `
local inserted = redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", ARGV[2])
if inserted then
    return "reserved"
end
local current = redis.call("GET", KEYS[1])
if current == "completed" then
    return "completed"
end
return "processing"
`;

const COMPLETE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    redis.call("SET", KEYS[1], "completed", "XX", "PX", ARGV[2])
    return 1
end
return 0
`;

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
end
return 0
`;

const RATE_SCRIPT = `
local userCount = redis.call("INCR", KEYS[1])
if userCount == 1 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local orgCount = redis.call("INCR", KEYS[2])
if orgCount == 1 then
    redis.call("PEXPIRE", KEYS[2], ARGV[1])
end
return {
    userCount,
    redis.call("PTTL", KEYS[1]),
    orgCount,
    redis.call("PTTL", KEYS[2])
}
`;

export interface ChatControlStore {
    evaluate(
        script: string,
        keys: readonly string[],
        arguments_: ReadonlyArray<string | number>,
    ): Promise<unknown>;
}

export interface ChatIdempotencyReservation {
    complete(): Promise<void>;
    release(): Promise<void>;
}

export interface ChatControlService {
    reserveIdempotency(input: {
        orgId: string;
        userId: string;
        clientRequestId: string;
        reservationToken: string;
    }): Promise<ChatIdempotencyReservation>;
    consumeRateLimit(input: {
        orgId: string;
        userId: string;
        plan: OrganisationPlan;
    }): Promise<void>;
}

const redisChatControlStore: ChatControlStore = {
    evaluate(script, keys, arguments_) {
        return redis.eval(
            script,
            keys.length,
            ...keys,
            ...arguments_,
        );
    },
};

export function createChatControlService(
    store: ChatControlStore = redisChatControlStore,
): ChatControlService {
    return {
        async reserveIdempotency(input) {
            const key = deriveControlKey(
                "idempotency",
                input.orgId,
                input.userId,
                input.clientRequestId,
            );
            let result: "reserved" | "processing" | "completed";

            try {
                result = reservationResultSchema.parse(
                    await store.evaluate(
                        RESERVE_SCRIPT,
                        [key],
                        [input.reservationToken, CHAT_IDEMPOTENCY_TTL_MS],
                    ),
                );
            } catch {
                throw dependencyUnavailable();
            }

            if (result === "processing") {
                throw new AppError(
                    409,
                    "REQUEST_IN_PROGRESS",
                    "This request is already processing.",
                );
            }

            if (result === "completed") {
                throw new AppError(
                    409,
                    "DUPLICATE_REQUEST",
                    "This request has already completed.",
                );
            }

            return createReservation(
                store,
                key,
                input.reservationToken,
            );
        },
        async consumeRateLimit(input) {
            const limits = CHAT_RATE_LIMITS[input.plan];
            const userKey = deriveControlKey(
                "rate-user",
                input.orgId,
                input.userId,
            );
            const organisationKey = deriveControlKey(
                "rate-organisation",
                input.orgId,
            );
            let result: [number, number, number, number];

            try {
                result = rateResultSchema.parse(
                    await store.evaluate(
                        RATE_SCRIPT,
                        [userKey, organisationKey],
                        [CHAT_RATE_LIMIT_WINDOW_MS],
                    ),
                );
            } catch {
                throw dependencyUnavailable();
            }

            const [userCount, userTtl, organisationCount, organisationTtl] =
                result;
            const retryTtl = Math.max(
                userCount > limits.userRpm ? userTtl : 0,
                organisationCount > limits.organisationRpm
                    ? organisationTtl
                    : 0,
            );

            if (retryTtl > 0) {
                throw new AppError(
                    429,
                    "RATE_LIMITED",
                    "Too many chat requests.",
                    {
                        retryAfterSeconds: Math.max(
                            1,
                            Math.ceil(retryTtl / 1_000),
                        ),
                    },
                );
            }
        },
    };
}

export const chatControlService = createChatControlService();

function createReservation(
    store: ChatControlStore,
    key: string,
    reservationToken: string,
): ChatIdempotencyReservation {
    return {
        async complete() {
            try {
                const result = await store.evaluate(
                    COMPLETE_SCRIPT,
                    [key],
                    [reservationToken, CHAT_IDEMPOTENCY_TTL_MS],
                );

                if (Number(result) !== 1) {
                    throw dependencyUnavailable();
                }
            } catch {
                throw dependencyUnavailable();
            }
        },
        async release() {
            try {
                await store.evaluate(
                    RELEASE_SCRIPT,
                    [key],
                    [reservationToken],
                );
            } catch {
                throw dependencyUnavailable();
            }
        },
    };
}

function deriveControlKey(
    purpose: "idempotency" | "rate-user" | "rate-organisation",
    ...trustedIdentifiers: readonly string[]
): string {
    const digest = createHmac("sha256", controlSecret)
        .update(`chat:${purpose}`)
        .update("\0")
        .update(trustedIdentifiers.join("\0"))
        .digest("hex");

    return `chat:${purpose}:${digest}`;
}

function dependencyUnavailable(): AppError {
    return new AppError(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "Chat processing is temporarily unavailable.",
    );
}
