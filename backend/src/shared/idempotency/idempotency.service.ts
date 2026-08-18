import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { env } from "../../config/env.js";
import { AppError } from "../errors/app-error.js";
import { redis } from "../lib/redis.js";

const requestFingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const idempotencyRecordSchema = z.discriminatedUnion("status", [
    z.object({
        status: z.literal("PROCESSING"),
        requestId: z.string().min(1),
        requestFingerprint: requestFingerprintSchema,
        startedAt: z.string().datetime(),
    }).strict(),
    z.object({
        status: z.literal("COMPLETED"),
        requestId: z.string().min(1),
        requestFingerprint: requestFingerprintSchema,
        completedAt: z.string().datetime(),
    }).strict(),
]);

export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;

const RESERVE_SCRIPT = `
local inserted = redis.call("SET", KEYS[1], ARGV[1], "NX", "EX", ARGV[2])
if inserted then
    return "RESERVED"
end
return redis.call("GET", KEYS[1])
`;

const COMPLETE_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
    return 0
end
local decoded, record = pcall(cjson.decode, current)
if not decoded then
    return -1
end
if record.status ~= "PROCESSING" or record.requestId ~= ARGV[1] then
    return 0
end
redis.call("SET", KEYS[1], ARGV[2], "XX", "EX", ARGV[3])
return 1
`;

const RELEASE_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
    return 0
end
local decoded, record = pcall(cjson.decode, current)
if not decoded then
    return -1
end
if record.status ~= "PROCESSING" or record.requestId ~= ARGV[1] then
    return 0
end
return redis.call("DEL", KEYS[1])
`;

export interface IdempotencyStore {
    evaluate(
        script: string,
        keys: readonly string[],
        arguments_: ReadonlyArray<string | number>,
    ): Promise<unknown>;
}

export interface IdempotencyReservation {
    markProviderExecutionStarted(): void;
    markCompleted(): Promise<void>;
    releaseBeforeExecution(): Promise<void>;
}

export interface IdempotencyService {
    reserve(input: {
        readonly orgId: string;
        readonly userId: string;
        readonly clientRequestId: string;
        readonly requestId: string;
        readonly requestFingerprint: string;
    }): Promise<IdempotencyReservation>;
}

export interface IdempotencyRequestFingerprintInput {
    readonly conversationId: string;
    readonly prompt: string;
    readonly routingMode: "auto" | "manual";
    readonly providerId?: string;
}

const redisIdempotencyStore: IdempotencyStore = {
    evaluate(script, keys, arguments_) {
        return redis.eval(
            script,
            keys.length,
            ...keys,
            ...arguments_,
        );
    },
};

const keySecret = Buffer.from(env.AUTH_RATE_LIMIT_SECRET, "base64url");

export function createIdempotencyService(
    store: IdempotencyStore = redisIdempotencyStore,
): IdempotencyService {
    return {
        async reserve(input) {
            const key = deriveIdempotencyKey(input);
            const requestFingerprint = requestFingerprintSchema.parse(
                input.requestFingerprint,
            );
            const processingRecord = serializeRecord({
                status: "PROCESSING",
                requestId: input.requestId,
                requestFingerprint,
                startedAt: new Date().toISOString(),
            });
            let result: unknown;

            try {
                result = await store.evaluate(
                    RESERVE_SCRIPT,
                    [key],
                    [
                        processingRecord,
                        env.IDEMPOTENCY_PROCESSING_TTL_SECONDS,
                    ],
                );
            } catch {
                throw idempotencyUnavailable();
            }

            if (result !== "RESERVED") {
                const record = parseRecord(result);

                if (
                    !requestFingerprintsMatch(
                        record.requestFingerprint,
                        requestFingerprint,
                    )
                ) {
                    throw new AppError(
                        409,
                        "DUPLICATE_REQUEST",
                        "This client request ID is already associated with another request.",
                    );
                }

                if (record.status === "PROCESSING") {
                    throw new AppError(
                        409,
                        "REQUEST_IN_PROGRESS",
                        "This request is already processing.",
                    );
                }

                throw new AppError(
                    409,
                    "DUPLICATE_REQUEST",
                    "This request has already completed.",
                );
            }

            return createReservation(
                store,
                key,
                input.requestId,
                requestFingerprint,
            );
        },
    };
}

export const idempotencyService = createIdempotencyService();

export function createIdempotencyRequestFingerprint(
    input: IdempotencyRequestFingerprintInput,
): string {
    const promptFingerprint = createOpaqueHmac(
        "chat:idempotency:prompt",
        input.prompt,
    );
    const canonicalRequest = JSON.stringify([
        "v1",
        input.conversationId,
        input.routingMode,
        input.providerId ?? null,
        promptFingerprint,
    ]);

    return createOpaqueHmac(
        "chat:idempotency:request",
        canonicalRequest,
    );
}

function createReservation(
    store: IdempotencyStore,
    key: string,
    requestId: string,
    requestFingerprint: string,
): IdempotencyReservation {
    let providerExecutionStarted = false;

    return {
        markProviderExecutionStarted() {
            providerExecutionStarted = true;
        },
        async markCompleted() {
            const completedRecord = serializeRecord({
                status: "COMPLETED",
                requestId,
                requestFingerprint,
                completedAt: new Date().toISOString(),
            });

            try {
                const result = await store.evaluate(
                    COMPLETE_SCRIPT,
                    [key],
                    [
                        requestId,
                        completedRecord,
                        env.IDEMPOTENCY_COMPLETED_TTL_SECONDS,
                    ],
                );

                if (Number(result) !== 1) {
                    throw idempotencyUnavailable();
                }
            } catch {
                throw idempotencyUnavailable();
            }
        },
        async releaseBeforeExecution() {
            if (providerExecutionStarted) {
                throw idempotencyUnavailable();
            }

            try {
                const result = await store.evaluate(
                    RELEASE_SCRIPT,
                    [key],
                    [requestId],
                );

                if (Number(result) !== 1) {
                    throw idempotencyUnavailable();
                }
            } catch {
                throw idempotencyUnavailable();
            }
        },
    };
}

function deriveIdempotencyKey(input: {
    readonly orgId: string;
    readonly userId: string;
    readonly clientRequestId: string;
}): string {
    const digest = createHmac("sha256", keySecret)
        .update("chat:idempotency")
        .update("\0")
        .update([
            input.orgId,
            input.userId,
            input.clientRequestId,
        ].join("\0"))
        .digest("hex");

    return `chat:idempotency:${digest}`;
}

function createOpaqueHmac(domain: string, value: string): string {
    return createHmac("sha256", keySecret)
        .update(domain)
        .update("\0")
        .update(value, "utf8")
        .digest("hex");
}

function requestFingerprintsMatch(left: string, right: string): boolean {
    return timingSafeEqual(
        Buffer.from(left, "hex"),
        Buffer.from(right, "hex"),
    );
}

function serializeRecord(record: IdempotencyRecord): string {
    return JSON.stringify(idempotencyRecordSchema.parse(record));
}

function parseRecord(value: unknown): IdempotencyRecord {
    if (typeof value !== "string") {
        throw idempotencyUnavailable();
    }

    try {
        return idempotencyRecordSchema.parse(JSON.parse(value));
    } catch {
        throw idempotencyUnavailable();
    }
}

function idempotencyUnavailable(): AppError {
    return new AppError(
        503,
        "IDEMPOTENCY_UNAVAILABLE",
        "Request deduplication is temporarily unavailable.",
    );
}
