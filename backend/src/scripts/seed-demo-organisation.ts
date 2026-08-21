import { randomUUID } from "node:crypto";

import mongoose from "mongoose";

import { OrganisationModel } from "../features/organisations/organisation.model.js";
import { UserModel } from "../features/users/user.model.js";
import {
    hashPassword,
    validateNewPassword,
} from "../shared/security/password.js";
import {
    DEMO_ORGANISATION,
    DEMO_PUBLIC_USER,
    LEGACY_PRIVILEGED_DEMO_EMAILS,
    parseDemoSeedEnvironment,
} from "./demo-seed.config.js";

async function seedDemoOrganisation(): Promise<void> {
    const environment = parseDemoSeedEnvironment(process.env);
    const publicPassword = validateNewPassword(environment.publicPassword);

    await mongoose.connect(environment.mongoUri);

    try {
        await Promise.all([
            OrganisationModel.init(),
            UserModel.init(),
        ]);

        let organisation = await OrganisationModel.findOne({
            slug: DEMO_ORGANISATION.slug,
        });

        if (organisation === null) {
            organisation = await OrganisationModel.create({
                orgId: randomUUID(),
                name: DEMO_ORGANISATION.name,
                slug: DEMO_ORGANISATION.slug,
                status: "ACTIVE",
                plan: "FREE",
                monthlyTokenBudget: 100_000,
                retention: { mode: "METADATA_ONLY" },
                policy: {
                    maskThreshold: 40,
                    blockThreshold: 70,
                },
                featureFlags: {
                    autoRouting: false,
                    teamLeadView: false,
                    anomalyDetection: false,
                    auditExport: false,
                },
            });
        } else {
            organisation.name = DEMO_ORGANISATION.name;
            organisation.status = "ACTIVE";
            organisation.plan = "FREE";
            organisation.monthlyTokenBudget = 100_000;
            organisation.retention = { mode: "METADATA_ONLY" };
            organisation.policy = {
                maskThreshold: 40,
                blockThreshold: 70,
            };
            organisation.featureFlags = {
                autoRouting: false,
                teamLeadView: false,
                anomalyDetection: false,
                auditExport: false,
            };
            await organisation.save();
        }

        await disableLegacyPrivilegedUsers(organisation.orgId);

        const emailNormalized = DEMO_PUBLIC_USER.email.toLowerCase();
        const publicUserQuery = UserModel.findOne({
            orgId: organisation.orgId,
            emailNormalized,
        });

        if (environment.resetPasswords) {
            publicUserQuery.select("+passwordHash");
        }

        let publicUser = await publicUserQuery;

        if (publicUser === null) {
            publicUser = await UserModel.create({
                userId: randomUUID(),
                orgId: organisation.orgId,
                email: DEMO_PUBLIC_USER.email,
                emailNormalized,
                passwordHash: await hashPassword(publicPassword),
                displayName: DEMO_PUBLIC_USER.displayName,
                role: DEMO_PUBLIC_USER.role,
                permissions: [...DEMO_PUBLIC_USER.permissions],
                status: "ACTIVE",
                failedLoginCount: 0,
            });
        } else {
            publicUser.displayName = DEMO_PUBLIC_USER.displayName;
            publicUser.role = DEMO_PUBLIC_USER.role;
            publicUser.permissions = [...DEMO_PUBLIC_USER.permissions];
            publicUser.status = "ACTIVE";
            publicUser.set("teamId", undefined);

            if (environment.resetPasswords) {
                publicUser.passwordHash = await hashPassword(publicPassword);
            }

            await publicUser.save();
        }

        process.stdout.write([
            "Demo seed complete.",
            `Organisation slug: ${DEMO_ORGANISATION.slug}`,
            `Email: ${DEMO_PUBLIC_USER.email}`,
            `Role: ${DEMO_PUBLIC_USER.role}`,
            "Password: supplied securely via DEMO_PUBLIC_PASSWORD (not printed).",
            "",
        ].join("\n"));
    } finally {
        await mongoose.disconnect();
    }
}

async function disableLegacyPrivilegedUsers(orgId: string): Promise<void> {
    const users = await UserModel.find({
        orgId,
        emailNormalized: {
            $in: LEGACY_PRIVILEGED_DEMO_EMAILS.map((email) => (
                email.toLowerCase()
            )),
        },
    });

    for (const user of users) {
        if (user.status !== "DISABLED") {
            user.status = "DISABLED";
            await user.save();
        }
    }
}

void seedDemoOrganisation().catch(async (error: unknown) => {
    process.stderr.write(
        `${error instanceof Error ? error.message : "Demo seed failed."}\n`,
    );

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => undefined);
    }

    process.exitCode = 1;
});
