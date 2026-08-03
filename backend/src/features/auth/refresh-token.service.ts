import {
    createHash,
    randomBytes,
    randomUUID,
} from "node:crypto";

import type { CookieOptions } from "express";

import { env } from "../../config/env.js";
import { RefreshTokenModel } from "./refresh-token.model.js";

export const REFRESH_COOKIE_NAME = "proxiai_refresh";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";
export const REFRESH_TOKEN_BYTES = 32;

export interface InitialRefreshTokenMaterial {
    tokenId: string;
    sessionId: string;
    familyId: string;
    orgId: string;
    userId: string;
    tokenHash: string;
    rawToken: string;
    expiresAt: Date;
}

export interface RotatedRefreshTokenMaterial {
    tokenId: string;
    sessionId: string;
    familyId: string;
    orgId: string;
    userId: string;
    tokenHash: string;
    rawToken: string;
    expiresAt: Date;
}

export function hashRefreshToken(rawToken: string): string {
    return createHash("sha256")
        .update(rawToken, "utf8")
        .digest("hex");
}

function createRefreshTokenMaterial(
    input: {
        familyId: string;
        orgId: string;
        sessionId: string;
        userId: string;
    },
    now = new Date(),
): RotatedRefreshTokenMaterial {
    const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(
        now.getTime()
        + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1_000,
    );

    return {
        tokenId: randomUUID(),
        sessionId: input.sessionId,
        familyId: input.familyId,
        orgId: input.orgId,
        userId: input.userId,
        tokenHash: hashRefreshToken(rawToken),
        rawToken,
        expiresAt,
    };
}

export function createInitialRefreshTokenMaterial(
    orgId: string,
    userId: string,
    now = new Date(),
): InitialRefreshTokenMaterial {
    const material = createRefreshTokenMaterial(
        {
            familyId: randomUUID(),
            orgId,
            sessionId: randomUUID(),
            userId,
        },
        now,
    );

    return {
        tokenId: material.tokenId,
        sessionId: material.sessionId,
        familyId: material.familyId,
        orgId,
        userId,
        tokenHash: material.tokenHash,
        rawToken: material.rawToken,
        expiresAt: material.expiresAt,
    };
}

export function createRotatedRefreshTokenMaterial(
    input: {
        familyId: string;
        orgId: string;
        sessionId: string;
        userId: string;
    },
    now = new Date(),
): RotatedRefreshTokenMaterial {
    return createRefreshTokenMaterial(input, now);
}

export async function persistInitialRefreshToken(
    material: InitialRefreshTokenMaterial,
): Promise<void> {
    await RefreshTokenModel.create({
        tokenId: material.tokenId,
        sessionId: material.sessionId,
        familyId: material.familyId,
        orgId: material.orgId,
        userId: material.userId,
        tokenHash: material.tokenHash,
        expiresAt: material.expiresAt,
    });
}

export function getRefreshCookieOptions(): CookieOptions {
    return {
        httpOnly: true,
        maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1_000,
        path: REFRESH_COOKIE_PATH,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
    };
}

export function getRefreshCookieClearOptions(): CookieOptions {
    return {
        httpOnly: true,
        path: REFRESH_COOKIE_PATH,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
    };
}
