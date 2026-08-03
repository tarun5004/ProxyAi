import { randomUUID } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { env } from "../../config/env.js";
import {
    USER_PERMISSIONS,
    USER_ROLES,
} from "../users/user.types.js";
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

const accessTokenPayloadSchema = z.strictObject({
    aud: z.literal(ACCESS_TOKEN_AUDIENCE),
    exp: z.number().int(),
    iat: z.number().int(),
    iss: z.literal(ACCESS_TOKEN_ISSUER),
    jti: z.string().uuid(),
    orgId: z.string().uuid(),
    permissions: z.array(z.enum(USER_PERMISSIONS)),
    role: z.enum(USER_ROLES),
    sessionId: z.string().uuid(),
    sub: z.string().uuid(),
    type: z.literal(ACCESS_TOKEN_TYPE),
});

export interface VerifiedAccessTokenClaims {
    userId: string;
    orgId: string;
    sessionId: string;
}

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

export async function verifyAccessToken(
    accessToken: string,
): Promise<VerifiedAccessTokenClaims | null> {
    try {
        const { payload, protectedHeader } = await jwtVerify(
            accessToken,
            accessTokenSecret,
            {
                algorithms: [ACCESS_TOKEN_ALGORITHM],
                audience: ACCESS_TOKEN_AUDIENCE,
                issuer: ACCESS_TOKEN_ISSUER,
                typ: ACCESS_TOKEN_PROTECTED_TYPE,
            },
        );

        if (
            protectedHeader.alg !== ACCESS_TOKEN_ALGORITHM
            || protectedHeader.typ !== ACCESS_TOKEN_PROTECTED_TYPE
        ) {
            return null;
        }

        const parsedPayload =
            accessTokenPayloadSchema.safeParse(payload);

        if (!parsedPayload.success) {
            return null;
        }

        return {
            userId: parsedPayload.data.sub,
            orgId: parsedPayload.data.orgId,
            sessionId: parsedPayload.data.sessionId,
        };
    } catch {
        return null;
    }
}
