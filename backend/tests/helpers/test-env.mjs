export const authTestEnvironment = Object.freeze({
    ACCESS_TOKEN_TTL_MINUTES: "15",
    AUTH_RATE_LIMIT_SECRET: Buffer.alloc(32, 2).toString("base64url"),
    CHAT_RATE_LIMIT_ENTERPRISE_ORG_RPM: "1200",
    CHAT_RATE_LIMIT_ENTERPRISE_USER_RPM: "60",
    CHAT_RATE_LIMIT_FREE_ORG_RPM: "60",
    CHAT_RATE_LIMIT_FREE_USER_RPM: "10",
    CHAT_RATE_LIMIT_PRO_ORG_RPM: "300",
    CHAT_RATE_LIMIT_PRO_USER_RPM: "30",
    GROQ_API_KEY: "gsk_test_value_for_unit_tests",
    GROQ_MODEL: "llama-3.1-8b-instant",
    JWT_ACCESS_SECRET: Buffer.alloc(32, 1).toString("base64url"),
    PROVIDER_REQUEST_TIMEOUT_MS: "30000",
    REFRESH_TOKEN_TTL_DAYS: "7",
});

export function applyAuthTestEnvironment(
    environment = process.env,
) {
    for (const [name, value] of Object.entries(authTestEnvironment)) {
        environment[name] ??= value;
    }
}
