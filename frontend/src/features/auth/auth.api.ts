import { z } from "zod";

import { createSuccessEnvelopeSchema } from "@/lib/api/api-envelope";
import { requestJson } from "@/lib/api/api-client";

import {
    authContextSchema,
    loginInputSchema,
    loginUserSchema,
    type LoginInput,
} from "./auth.types";

const tokenDataSchema = z.object({
    accessToken: z.string().min(1),
    expiresInSeconds: z.number().int().positive(),
});

const loginResponseSchema = createSuccessEnvelopeSchema(
    tokenDataSchema.extend({
        user: loginUserSchema,
    }),
);

const refreshResponseSchema = createSuccessEnvelopeSchema(tokenDataSchema);
const meResponseSchema = createSuccessEnvelopeSchema(authContextSchema);
const logoutResponseSchema = createSuccessEnvelopeSchema(
    z.object({ loggedOut: z.literal(true) }),
);

export async function loginRequest(input: LoginInput) {
    const validatedInput = loginInputSchema.parse(input);

    return requestJson({
        path: "/auth/login",
        method: "POST",
        body: validatedInput,
        schema: loginResponseSchema,
    });
}

export function refreshRequest() {
    return requestJson({
        path: "/auth/refresh",
        method: "POST",
        schema: refreshResponseSchema,
    });
}

export function meRequest(accessToken: string) {
    return requestJson({
        path: "/auth/me",
        accessToken,
        schema: meResponseSchema,
    });
}

export function logoutRequest() {
    return requestJson({
        path: "/auth/logout",
        method: "POST",
        schema: logoutResponseSchema,
    });
}
