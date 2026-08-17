import { z } from "zod";

const apiFailureSchema = z.object({
    success: z.literal(false),
    error: z.object({
        code: z.string(),
        message: z.string(),
        requestId: z.string(),
        details: z.unknown().optional(),
    }),
});

export class ApiError extends Error {
    public readonly status: number;
    public readonly code: string;
    public readonly requestId?: string;
    public readonly details?: unknown;

    public constructor(input: {
        status: number;
        code: string;
        message: string;
        requestId?: string;
        details?: unknown;
    }) {
        super(input.message);
        this.name = "ApiError";
        this.status = input.status;
        this.code = input.code;
        this.requestId = input.requestId;
        this.details = input.details;
    }

    public static async fromResponse(response: Response): Promise<ApiError> {
        let body: unknown;

        try {
            body = await response.json();
        } catch {
            return new ApiError({
                status: response.status,
                code: "REQUEST_FAILED",
                message: "The request could not be completed.",
            });
        }

        const parsedBody = apiFailureSchema.safeParse(body);

        if (!parsedBody.success) {
            return new ApiError({
                status: response.status,
                code: "REQUEST_FAILED",
                message: "The request could not be completed.",
            });
        }

        return new ApiError({
            status: response.status,
            code: parsedBody.data.error.code,
            message: parsedBody.data.error.message,
            requestId: parsedBody.data.error.requestId,
            details: parsedBody.data.error.details,
        });
    }
}
