export class AppError extends Error {
    public readonly isOperational = true;

    public constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = "AppError";
    }
}
