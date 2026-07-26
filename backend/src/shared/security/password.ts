import argon2 from "argon2";
import { z } from "zod";

export const MIN_PASSWORD_CODE_POINTS = 15;
export const MAX_PASSWORD_CODE_POINTS = 128;

const ARGON2_OPTIONS = Object.freeze({
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
});

const normalizedPasswordSchema = z
    .string()
    .transform((password) => password.normalize("NFC"));

const newPasswordSchema = normalizedPasswordSchema
    .refine(
        (password) =>
            Array.from(password).length >= MIN_PASSWORD_CODE_POINTS,
        {
            message:
                `Password must contain at least ${MIN_PASSWORD_CODE_POINTS} Unicode code points.`,
        },
    )
    .refine(
        (password) =>
            Array.from(password).length <= MAX_PASSWORD_CODE_POINTS,
        {
            message:
                `Password must contain at most ${MAX_PASSWORD_CODE_POINTS} Unicode code points.`,
        },
    );

const verificationPasswordSchema = normalizedPasswordSchema.refine(
    (password) =>
        Array.from(password).length <= MAX_PASSWORD_CODE_POINTS,
    {
        message:
            `Password must contain at most ${MAX_PASSWORD_CODE_POINTS} Unicode code points.`,
    },
);

export class PasswordVerificationError extends Error {
    public readonly code = "PASSWORD_VERIFICATION_FAILED";
    public readonly isOperational = true;

    public constructor() {
        super("Password verification could not be completed.");
        this.name = "PasswordVerificationError";
    }
}

export function validateNewPassword(password: unknown): string {
    return newPasswordSchema.parse(password);
}

export async function hashPassword(password: unknown): Promise<string> {
    const normalizedPassword = validateNewPassword(password);

    return argon2.hash(normalizedPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(
    storedHash: string,
    candidatePassword: unknown,
): Promise<boolean> {
    const normalizedCandidate =
        verificationPasswordSchema.parse(candidatePassword);

    if (
        typeof storedHash !== "string"
        || !storedHash.startsWith("$argon2id$")
    ) {
        throw new PasswordVerificationError();
    }

    try {
        return await argon2.verify(storedHash, normalizedCandidate);
    } catch {
        throw new PasswordVerificationError();
    }
}
