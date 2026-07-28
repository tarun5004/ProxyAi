import { z } from "zod";

import { MAX_PASSWORD_CODE_POINTS } from "../../shared/security/password.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const loginRequestSchema = z
    .object({
        organisationSlug: z
            .string()
            .trim()
            .toLowerCase()
            .min(2)
            .max(63)
            .regex(SLUG_PATTERN),
        email: z
            .string()
            .trim()
            .toLowerCase()
            .email()
            .max(254),
        password: z
            .string()
            .min(1)
            .refine(
                (password) =>
                    Array.from(password.normalize("NFC")).length
                    <= MAX_PASSWORD_CODE_POINTS,
                {
                    message:
                        `Password must contain at most ${MAX_PASSWORD_CODE_POINTS} Unicode code points.`,
                },
            ),
    })
    .strict()
    .transform(({ email, organisationSlug, password }) => ({
        organisationSlug,
        emailNormalized: email,
        password,
    }));
