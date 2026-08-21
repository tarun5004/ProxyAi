import assert from "node:assert/strict";
import test from "node:test";

const {
    DEMO_PUBLIC_USER,
    parseDemoSeedEnvironment,
} = await import("../dist/scripts/demo-seed.config.js");

test("public demo identity has employee-only permissions", () => {
    assert.equal(DEMO_PUBLIC_USER.role, "EMPLOYEE");
    assert.deepEqual(DEMO_PUBLIC_USER.permissions, [
        "chat:send",
        "chat:view_own",
    ]);
});

test("demo seed requires explicit enablement and opt-in password reset", () => {
    assert.throws(
        () => parseDemoSeedEnvironment({
            MONGO_URI: "mongodb://localhost/demo",
            DEMO_PUBLIC_PASSWORD: "safe-demo-password",
        }),
        /DEMO_SEED_ENABLED=true/,
    );

    const defaultConfiguration = parseDemoSeedEnvironment({
        MONGO_URI: "mongodb://localhost/demo",
        DEMO_PUBLIC_PASSWORD: "safe-demo-password",
        DEMO_SEED_ENABLED: "true",
    });
    const resetConfiguration = parseDemoSeedEnvironment({
        MONGO_URI: "mongodb://localhost/demo",
        DEMO_PUBLIC_PASSWORD: "safe-demo-password",
        DEMO_SEED_ENABLED: "true",
        DEMO_SEED_RESET_PASSWORDS: "true",
    });

    assert.equal(defaultConfiguration.resetPasswords, false);
    assert.equal(resetConfiguration.resetPasswords, true);
});
