import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
} from "node:crypto";

import { z } from "zod";

import { runtimeEnv } from "../../config/runtime-env.js";
import { AppError } from "../errors/app-error.js";

export const ENCRYPTION_ALGORITHM = "AES-256-GCM" as const;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const AAD_VERSION = "proxiai:aad:v1";

const canonicalBase64UrlSchema = (bytes?: number) => z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9_-]+$/)
    .refine((value) => {
        const decoded = Buffer.from(value, "base64url");

        return (bytes === undefined || decoded.length === bytes)
            && decoded.toString("base64url") === value;
    }, "Value must be canonical unpadded base64url.");

const encryptedPayloadSchema = z.strictObject({
    algorithm: z.literal(ENCRYPTION_ALGORITHM),
    ciphertext: canonicalBase64UrlSchema(),
    iv: canonicalBase64UrlSchema(IV_BYTES),
    authTag: canonicalBase64UrlSchema(AUTH_TAG_BYTES),
    keyVersion: z.number().int().positive().safe(),
});

const keyringJsonSchema = z.record(
    z.string().regex(/^[1-9]\d*$/),
    canonicalBase64UrlSchema(KEY_BYTES),
);

export interface EncryptedPayload {
    readonly algorithm: typeof ENCRYPTION_ALGORITHM;
    readonly ciphertext: string;
    readonly iv: string;
    readonly authTag: string;
    readonly keyVersion: number;
}

export interface EncryptionContext {
    readonly orgId: string;
    readonly entityType: "MESSAGE" | "CONVERSATION";
    readonly entityId: string;
    readonly fieldName: "content" | "title";
    readonly conversationId: string;
    readonly messageId?: string;
}

export interface EncryptionKeyring {
    readonly activeVersion: number;
    readonly keys: ReadonlyMap<number, Buffer>;
}

export interface EncryptionService {
    encrypt(plaintext: string, context: EncryptionContext): EncryptedPayload;
    decrypt(payload: EncryptedPayload, context: EncryptionContext): string;
}

let runtimeKeyring: EncryptionKeyring | undefined;
let runtimeService: EncryptionService | undefined;

export function loadEncryptionKeyring(
    keysJson: string,
    activeVersion: number,
): EncryptionKeyring {
    let parsedJson: unknown;

    try {
        parsedJson = JSON.parse(keysJson);
    } catch {
        throw configurationError();
    }

    const parsed = keyringJsonSchema.safeParse(parsedJson);

    if (!parsed.success) {
        throw configurationError();
    }

    const keys = new Map<number, Buffer>();

    for (const [versionText, encodedKey] of Object.entries(parsed.data)) {
        keys.set(Number(versionText), Buffer.from(encodedKey, "base64url"));
    }

    if (!keys.has(activeVersion)) {
        throw configurationError();
    }

    return Object.freeze({
        activeVersion,
        keys,
    });
}

export function createEncryptionService(
    keyring: EncryptionKeyring,
): EncryptionService {
    return Object.freeze({
        encrypt(plaintext: string, context: EncryptionContext) {
            const key = keyring.keys.get(keyring.activeVersion);

            if (key === undefined) {
                throw unavailableError();
            }

            try {
                const iv = randomBytes(IV_BYTES);
                const cipher = createCipheriv("aes-256-gcm", key, iv, {
                    authTagLength: AUTH_TAG_BYTES,
                });
                cipher.setAAD(buildAad(context));
                const ciphertext = Buffer.concat([
                    cipher.update(plaintext, "utf8"),
                    cipher.final(),
                ]);
                const authTag = cipher.getAuthTag();

                return Object.freeze({
                    algorithm: ENCRYPTION_ALGORITHM,
                    ciphertext: ciphertext.toString("base64url"),
                    iv: iv.toString("base64url"),
                    authTag: authTag.toString("base64url"),
                    keyVersion: keyring.activeVersion,
                });
            } catch {
                throw unavailableError();
            }
        },
        decrypt(payload: EncryptedPayload, context: EncryptionContext) {
            const parsed = encryptedPayloadSchema.safeParse(payload);

            if (!parsed.success) {
                throw contentUnavailableError();
            }

            const key = keyring.keys.get(parsed.data.keyVersion);

            if (key === undefined) {
                throw unavailableError();
            }

            try {
                const decipher = createDecipheriv(
                    "aes-256-gcm",
                    key,
                    Buffer.from(parsed.data.iv, "base64url"),
                    { authTagLength: AUTH_TAG_BYTES },
                );
                decipher.setAAD(buildAad(context));
                decipher.setAuthTag(
                    Buffer.from(parsed.data.authTag, "base64url"),
                );

                return Buffer.concat([
                    decipher.update(
                        Buffer.from(parsed.data.ciphertext, "base64url"),
                    ),
                    decipher.final(),
                ]).toString("utf8");
            } catch {
                throw contentUnavailableError();
            }
        },
    });
}

export function normalizeEncryptedPayload(
    payload: EncryptedPayload,
): EncryptedPayload {
    return {
        algorithm: payload.algorithm,
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        authTag: payload.authTag,
        keyVersion: payload.keyVersion,
    };
}

export function initializeEncryption(): void {
    const keysJson = runtimeEnv.MESSAGE_ENCRYPTION_KEYS_JSON;
    const activeVersion = runtimeEnv.MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION;

    if (keysJson === undefined || activeVersion === undefined) {
        runtimeKeyring = undefined;
        runtimeService = undefined;
        return;
    }

    const keyring = loadEncryptionKeyring(keysJson, activeVersion);
    const service = createEncryptionService(keyring);

    for (const version of keyring.keys.keys()) {
        const versionedService = createEncryptionService({
            activeVersion: version,
            keys: keyring.keys,
        });
        const context: EncryptionContext = {
            orgId: "00000000-0000-4000-8000-000000000000",
            entityType: "MESSAGE",
            entityId: "00000000-0000-4000-8000-000000000001",
            fieldName: "content",
            conversationId: "00000000-0000-4000-8000-000000000002",
            messageId: "00000000-0000-4000-8000-000000000001",
        };
        const payload = versionedService.encrypt("encryption-canary", context);

        if (versionedService.decrypt(payload, context) !== "encryption-canary") {
            throw configurationError();
        }
    }

    runtimeKeyring = keyring;
    runtimeService = service;
}

export function isEncryptionReady(): boolean {
    return runtimeService !== undefined;
}

export function hasEncryptionKeyVersion(version: number): boolean {
    return runtimeKeyring?.keys.has(version) ?? false;
}

export function requireEncryptionService(): EncryptionService {
    if (
        runtimeService === undefined
        && runtimeEnv.MESSAGE_ENCRYPTION_KEYS_JSON !== undefined
        && runtimeEnv.MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION !== undefined
    ) {
        initializeEncryption();
    }

    if (runtimeService === undefined) {
        throw unavailableError();
    }

    return runtimeService;
}

function buildAad(context: EncryptionContext): Buffer {
    return Buffer.from([
        AAD_VERSION,
        context.orgId,
        context.entityType,
        context.entityId,
        context.fieldName,
        context.conversationId,
        context.messageId ?? "-",
    ].join("\u001f"), "utf8");
}

function configurationError(): Error {
    return new Error("Invalid environment configuration: MESSAGE_ENCRYPTION_KEYS_JSON");
}

function unavailableError(): AppError {
    return new AppError(
        503,
        "ENCRYPTION_UNAVAILABLE",
        "Encrypted storage is temporarily unavailable.",
    );
}

function contentUnavailableError(): AppError {
    return new AppError(
        500,
        "MESSAGE_CONTENT_UNAVAILABLE",
        "Stored message content is unavailable.",
    );
}
