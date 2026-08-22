import "dotenv/config";

import mongoose from "mongoose";

import { validateNewPassword } from "../shared/security/password.js";
import {
    createMongooseDemoIdentityDependencies,
} from "./demo-identity-mongoose.js";
import {
    DemoIdentityProvisioningError,
    provisionDemoIdentity,
} from "./demo-identity-provisioning.js";
import { parsePrivateDemoAdminEnvironment } from "./demo-operations.config.js";
import {
    DEMO_ORGANISATION,
    DEMO_PRIVATE_ADMIN,
} from "./demo-seed.config.js";

async function provisionPrivateDemoAdmin(): Promise<void> {
    const environment = parsePrivateDemoAdminEnvironment(process.env);
    const password = validateNewPassword(environment.password);

    await mongoose.connect(environment.mongoUri, { autoIndex: false });

    try {
        const result = await provisionDemoIdentity(
            {
                apply: environment.apply,
                password,
                revokeSessionsOnEveryApply: false,
                target: {
                    ...DEMO_PRIVATE_ADMIN,
                    organisationSlug: DEMO_ORGANISATION.slug,
                },
            },
            createMongooseDemoIdentityDependencies(),
        );

        process.stdout.write([
            `Database: ${mongoose.connection.name}`,
            `Organisation slug: ${DEMO_ORGANISATION.slug}`,
            `Email: ${DEMO_PRIVATE_ADMIN.email}`,
            `Role: ${DEMO_PRIVATE_ADMIN.role}`,
            `Mode: ${environment.apply ? "APPLY" : "DRY_RUN"}`,
            `Action: ${result.action}`,
            `Credential reset: ${result.credentialsReset ? "YES" : "NO"}`,
            `Sessions revoked: ${result.sessionsRevoked}`,
            "Password: supplied through protected input (not printed).",
            "",
        ].join("\n"));
    } finally {
        await mongoose.disconnect();
    }
}

void provisionPrivateDemoAdmin().catch(async (error: unknown) => {
    const message = error instanceof DemoIdentityProvisioningError
        || (
            error instanceof Error
            && error.message.startsWith("Refusing demo admin provisioning")
        )
        || (
            error instanceof Error
            && error.message.startsWith("Demo admin provisioning requires")
        )
        ? error.message
        : "Demo admin provisioning failed.";

    process.stderr.write(`${message}\n`);

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => undefined);
    }

    process.exitCode = 1;
});
