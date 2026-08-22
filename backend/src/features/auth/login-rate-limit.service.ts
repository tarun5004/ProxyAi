import { createHmac } from "node:crypto";

import { z } from "zod";

import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { redis } from "../../shared/lib/redis.js";

export const LOGIN_RATE_LIMIT_ATTEMPTS = 10;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;

const rateLimitSecret = Buffer.from(
    env.AUTH_RATE_LIMIT_SECRET,
    "base64url",
);
const redisResultSchema = z.tuple([
    z.coerce.number().int().min(1),
    z.coerce.number().int(),
]);
const INCREMENT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { count, ttl }
`;

export interface LoginRateLimitStore {
    evaluate(
        script: string,
        key: string,
        windowMs: number,
    ): Promise<unknown>;
}

const redisRateLimitStore: LoginRateLimitStore = {
    evaluate(script, key, windowMs) {
        return redis.eval(script, 1, key, windowMs);
    },
};

function deriveOpaqueKey(kind: string, value: string): string {
    return createHmac("sha256", rateLimitSecret)
        .update(kind)
        .update("\0")
        .update(value)
        .digest("hex");
}

export function deriveLoginRateLimitKeys(input: {
    ipAddress: string;
    organisationSlug: string;
    emailNormalized: string;
}): {
    accountKey: string;
    ipKey: string;
} {
    const accountIdentifier =
        `${input.organisationSlug}\0${input.emailNormalized}`;

    return {
        accountKey:
            `rate:login:account:${deriveOpaqueKey("account", accountIdentifier)}`,
        ipKey:
            `rate:login:ip:${deriveOpaqueKey("ip", input.ipAddress)}`,
    };
}

export function createLoginRateLimiter(
    store: LoginRateLimitStore = redisRateLimitStore,
) {
    return {
        async consume(input: {
            ipAddress: string;
            organisationSlug: string;
            emailNormalized: string;
        }): Promise<void> {
            const keys = deriveLoginRateLimitKeys(input);

            let results: Array<[number, number]>;

            try {
                results = await Promise.all(
                    [keys.ipKey, keys.accountKey].map(async (key) => {
                        const result = await store.evaluate(
                            INCREMENT_SCRIPT,
                            key,
                            LOGIN_RATE_LIMIT_WINDOW_MS,
                        );

                        return redisResultSchema.parse(result);
                    }),
                );
            } catch {
                throw new AppError(
                    503,
                    "DEPENDENCY_UNAVAILABLE",
                    "Login is temporarily unavailable.",
                );
            }

            const exceededResult = results.find(
                ([count]) => count > LOGIN_RATE_LIMIT_ATTEMPTS,
            );

            if (exceededResult) {
                const retryAfterSeconds = Math.max(
                    1,
                    Math.ceil(exceededResult[1] / 1_000),
                );

                throw new AppError(
                    429,
                    "RATE_LIMITED",
                    "Too many login attempts.",
                    {
                        retryAfterSeconds,
                    },
                );
            }
        },
    };
}

export const loginRateLimiter = createLoginRateLimiter();

export function createPublicDemoRateLimiter(
    store: LoginRateLimitStore = redisRateLimitStore,
) {
    return {
        async consume(input: { readonly ipAddress: string }): Promise<void> {
            const key = `rate:demo-admin:ip:${deriveOpaqueKey(
                "demo-admin-ip",
                input.ipAddress,
            )}`;

            let result: [number, number];

            try {
                result = redisResultSchema.parse(
                    await store.evaluate(
                        INCREMENT_SCRIPT,
                        key,
                        LOGIN_RATE_LIMIT_WINDOW_MS,
                    ),
                );
            } catch {
                throw new AppError(
                    503,
                    "DEPENDENCY_UNAVAILABLE",
                    "Login is temporarily unavailable.",
                );
            }

            if (result[0] > LOGIN_RATE_LIMIT_ATTEMPTS) {
                throw new AppError(
                    429,
                    "RATE_LIMITED",
                    "Too many login attempts.",
                    {
                        retryAfterSeconds: Math.max(
                            1,
                            Math.ceil(result[1] / 1_000),
                        ),
                    },
                );
            }
        },
    };
}

export const publicDemoRateLimiter = createPublicDemoRateLimiter();
