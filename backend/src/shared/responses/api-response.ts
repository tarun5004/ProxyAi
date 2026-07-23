export interface ApiSuccess<T> {
    success: true;
    data: T;
    meta: {
        requestId: string;
        nextCursor?: string | null;
    };
}

export interface ApiFailure {
    success: false;
    error: {
        code: string;
        message: string;
        requestId: string;
        details?: unknown;
    };
}

export function createSuccessResponse<T>(
    data: T,
    requestId: string,
    nextCursor?: string | null,
): ApiSuccess<T> {
    return {
        success: true,
        data,
        meta: {
            requestId,
            ...(nextCursor === undefined ? {} : { nextCursor }),
        },
    };
}

export function createErrorResponse(
    code: string,
    message: string,
    requestId: string,
    details?: unknown,
): ApiFailure {
    return {
        success: false,
        error: {
            code,
            message,
            requestId,
            ...(details === undefined ? {} : { details }),
        },
    };
}
