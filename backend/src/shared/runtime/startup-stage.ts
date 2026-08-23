export type ApiStartupStage =
    | "encryption_initialization"
    | "mongo_connection"
    | "redis_connection"
    | "encryption_readiness"
    | "async_infrastructure"
    | "http_listener";

export class ApiStartupStageError extends Error {
    public constructor(
        public readonly startupStage: ApiStartupStage,
        public readonly errorCode: string,
    ) {
        super("API startup stage failed.");
        this.name = "ApiStartupStageError";
    }
}

export async function runApiStartupStage<Result>(
    startupStage: ApiStartupStage,
    errorCode: string,
    operation: () => Result | Promise<Result>,
): Promise<Result> {
    try {
        return await operation();
    } catch {
        throw new ApiStartupStageError(startupStage, errorCode);
    }
}
