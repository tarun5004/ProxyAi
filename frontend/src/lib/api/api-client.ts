import type { z } from "zod";

import { createApiPath } from "@/lib/api/api-path";
import { ApiError } from "@/lib/errors/api-error";

export async function requestJson<TSchema extends z.ZodType>(input: {
    path: string;
    schema: TSchema;
    method?: "GET" | "PATCH" | "POST";
    accessToken?: string;
    body?: unknown;
    signal?: AbortSignal;
}): Promise<z.infer<TSchema>> {
    const headers = new Headers({
        accept: "application/json",
    });

    if (input.accessToken) {
        headers.set("authorization", `Bearer ${input.accessToken}`);
    }

    if (input.body !== undefined) {
        headers.set("content-type", "application/json");
    }

    const response = await fetch(
        createApiPath(input.path),
        {
            method: input.method ?? "GET",
            headers,
            credentials: "include",
            cache: "no-store",
            body: input.body === undefined
                ? undefined
                : JSON.stringify(input.body),
            signal: input.signal,
        },
    );

    if (!response.ok) {
        throw await ApiError.fromResponse(response);
    }

    return input.schema.parse(await response.json());
}
