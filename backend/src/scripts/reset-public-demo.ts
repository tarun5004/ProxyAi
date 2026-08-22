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
import { parsePublicDemoResetEnvironment } from "./demo-operations.config.js";
import {
    DEMO_ORGANISATION,
    DEMO_PUBLIC_USER,
} from "./demo-seed.config.js";

async function resetPublicDemo(): Promise<void> {
    const environment = parsePublicDemoResetEnvironment(process.env);
    const password = validateNewPassword(environment.password);

    await mongoose.connect(environment.mongoUri, { autoIndex: false });

    try {
        const result = await provisionDemoIdentity(
            {
                apply: environment.apply,
                password,
                revokeSessionsOnEveryApply: true,
                target: {
                    ...DEMO_PUBLIC_USER,
                    organisationSlug: DEMO_ORGANISATION.slug,
                    requiredRetentionMode: "METADATA_ONLY",
                },
            },
            createMongooseDemoIdentityDependencies(),
        );

        process.stdout.write([
            `Database: ${mongoose.connection.name}`,
            `Organisation slug: ${DEMO_ORGANISATION.slug}`,
            `Email: ${DEMO_PUBLIC_USER.email}`,
            `Role: ${DEMO_PUBLIC_USER.role}`,
            `Mode: ${environment.apply ? "APPLY" : "DRY_RUN"}`,
            `Action: ${result.action}`,
            `Sessions revoked: ${result.sessionsRevoked}`,
            "Conversation/message/accounting/audit deletion: DEFERRED",
            "Password: supplied through protected input (not printed).",
            "",
        ].join("\n"));
    } finally {
        await mongoose.disconnect();
    }
}

void resetPublicDemo().catch(async (error: unknown) => {
    const message = error instanceof DemoIdentityProvisioningError
        || (
            error instanceof Error
            && error.message.startsWith("Refusing public demo reset")
        )
        || (
            error instanceof Error
            && error.message.startsWith("Public demo reset requires")
        )
        ? error.message
        : "Public demo reset failed.";

    process.stderr.write(`${message}\n`);

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => undefined);
    }

    process.exitCode = 1;
});
