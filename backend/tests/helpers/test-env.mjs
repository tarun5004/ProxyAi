export const authTestEnvironment = Object.freeze({
    ACCESS_TOKEN_TTL_MINUTES: "15",
    AUTH_RATE_LIMIT_SECRET: Buffer.alloc(32, 2).toString("base64url"),
    JWT_ACCESS_SECRET: Buffer.alloc(32, 1).toString("base64url"),
    REFRESH_TOKEN_TTL_DAYS: "7",
});

export function applyAuthTestEnvironment(
    environment = process.env,
) {
    for (const [name, value] of Object.entries(authTestEnvironment)) {
        environment[name] ??= value;
    }
}
