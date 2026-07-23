import type { ErrorRequestHandler } from "express";

import { AppError } from "../errors/app-error.js";
import { createErrorResponse } from "../responses/api-response.js";

interface NormalizedError {
    code: string;
    details?: unknown;
    isOperational: boolean;
    message: string;
    statusCode: number;
}

type ParserError = Error & {
    body?: unknown;
    status?: unknown;
    type?: unknown;
};

function normalizeError(error: unknown): NormalizedError {
    if (error instanceof AppError) {
        return {
            code: error.code,
            details: error.details,
            isOperational: error.isOperational,
            message: error.message,
            statusCode: error.statusCode,
        };
    }

    if (error instanceof Error) {
        const parserError = error as ParserError;

        if (parserError.type === "entity.too.large") {
            return {
                code: "PAYLOAD_TOO_LARGE",
                isOperational: true,
                message: "Request body exceeds the 1 MB limit.",
                statusCode: 413,
            };
        }

        if (
            error instanceof SyntaxError
            && parserError.status === 400
            && "body" in parserError
        ) {
            return {
                code: "INVALID_JSON",
                isOperational: true,
                message: "Request body contains invalid JSON.",
                statusCode: 400,
            };
        }
    }

    return {
        code: "INTERNAL_ERROR",
        isOperational: false,
        message: "An unexpected error occurred.",
        statusCode: 500,
    };
}

export const globalErrorHandler: ErrorRequestHandler = (
    error,
    request,
    response,
    next,
) => {
    if (response.headersSent) {
        next(error);
        return;
    }

    const normalizedError = normalizeError(error);
    const logContext = {
        errorCode: normalizedError.code,
        event: normalizedError.isOperational
            ? "http.request.rejected"
            : "http.request.failed",
        method: request.method,
        statusCode: normalizedError.statusCode,
    };

    if (normalizedError.isOperational) {
        request.log.warn(logContext, "HTTP request rejected");
    } else {
        request.log.error(logContext, "HTTP request failed");
    }

    response.status(normalizedError.statusCode).json(
        createErrorResponse(
            normalizedError.code,
            normalizedError.message,
            request.requestId,
            normalizedError.details,
        ),
    );
};
