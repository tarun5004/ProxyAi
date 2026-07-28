import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";

import { env } from "../../config/env.js";
import type { AccessTokenInput } from "./auth.types.js";

export const ACCESS_TOKEN_ALGORITHM = "HS256";
export const ACCESS_TOKEN_AUDIENCE = "proxiai-api";
export const ACCESS_TOKEN_ISSUER = "proxiai";
export const ACCESS_TOKEN_PROTECTED_TYPE = "at+jwt";
export const ACCESS_TOKEN_TYPE = "access";

const accessTokenSecret = Buffer.from(
    env.JWT_ACCESS_SECRET,
    "base64url",
);

export async function createAccessToken(
    input: AccessTokenInput,
): Promise<{
    accessToken: string;
    expiresInSeconds: number;
}> {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const expiresInSeconds = env.ACCESS_TOKEN_TTL_MINUTES * 60;
    const expiresAt = issuedAt + expiresInSeconds;

    const accessToken = await new SignJWT({
        orgId: input.orgId,
        permissions: [...input.permissions],
        role: input.role,
        sessionId: input.sessionId,
        type: ACCESS_TOKEN_TYPE,
    })
        .setProtectedHeader({
            alg: ACCESS_TOKEN_ALGORITHM,
            typ: ACCESS_TOKEN_PROTECTED_TYPE,
        })
        .setSubject(input.userId)
        .setJti(randomUUID())
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .setIssuer(ACCESS_TOKEN_ISSUER)
        .setAudience(ACCESS_TOKEN_AUDIENCE)
        .sign(accessTokenSecret);

    return {
        accessToken,
        expiresInSeconds,
    };
}
