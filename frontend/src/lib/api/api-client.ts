import type { z } from "zod";

import { createApiPath } from "@/lib/api/api-path";
import { ApiError } from "@/lib/errors/api-error";

interface JsonRequest<TSchema extends z.ZodType> {
    path: string;
    schema: TSchema;
    method?: "GET" | "PATCH" | "POST";
    accessToken?: string;
    body?: unknown;
    signal?: AbortSignal;
}

export function requestJson<TSchema extends z.ZodType>(
    input: JsonRequest<TSchema> & { noContentStatus: 204 },
): Promise<z.infer<TSchema> | undefined>;
export function requestJson<TSchema extends z.ZodType>(
    input: JsonRequest<TSchema>,
): Promise<z.infer<TSchema>>;
export async function requestJson<TSchema extends z.ZodType>(
    input: JsonRequest<TSchema> & { noContentStatus?: 204 },
): Promise<z.infer<TSchema> | undefined> {
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

    if (
        input.noContentStatus !== undefined
        && response.status === input.noContentStatus
    ) {
        return undefined;
    }

    if (!response.ok) {
        throw await ApiError.fromResponse(response);
    }

    return input.schema.parse(await response.json());
}
