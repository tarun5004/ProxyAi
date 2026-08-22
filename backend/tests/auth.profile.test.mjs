import assert from "node:assert/strict";
import test from "node:test";

const { createSafeAuthProfile } = await import(
    "../dist/features/auth/auth-profile.js"
);

test("safe auth profile exposes workspace identity and retention only", () => {
    const profile = createSafeAuthProfile(
        {
            userId: "11111111-1111-4111-8111-111111111111",
            email: "employee@example.com",
            displayName: "Example Employee",
            role: "EMPLOYEE",
            permissions: ["chat:send", "chat:view_own"],
            passwordHash: "SENTINEL_PASSWORD_HASH",
        },
        {
            orgId: "22222222-2222-4222-8222-222222222222",
            name: "Example Organisation",
            plan: "FREE",
            retention: {
                mode: "ENCRYPTED_STORAGE",
                keyVersion: "SENTINEL_KEY_VERSION",
            },
        },
    );

    assert.deepEqual(profile, {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "employee@example.com",
        displayName: "Example Employee",
        role: "EMPLOYEE",
        permissions: ["chat:send", "chat:view_own"],
        organisation: {
            orgId: "22222222-2222-4222-8222-222222222222",
            name: "Example Organisation",
            plan: "FREE",
            retentionMode: "ENCRYPTED_STORAGE",
        },
    });
    const output = JSON.stringify(profile);
    assert.equal(output.includes("SENTINEL_PASSWORD_HASH"), false);
    assert.equal(output.includes("SENTINEL_KEY_VERSION"), false);
});
