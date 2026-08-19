import "dotenv/config";

import { z } from "zod";

const DEMO_ORGANISATION_SLUG = "proxiai-demo-2";
const DEMO_ADMIN_EMAIL = "admin@proxiai2.local";
const DEMO_ADMIN_DISPLAY_NAME = "ProxiAI Demo Admin";
const DEMO_MONTHLY_TOKEN_BUDGET = 10000_000;

const seedEnvironmentSchema = z.object({
    NODE_ENV: z.literal("development"),
    DEV_ADMIN_PASSWORD: z.string().min(1),
});

class DevelopmentSeedError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "DevelopmentSeedError";
    }
}

async function seedDevelopmentAdmin(): Promise<void> {
    const seedEnvironment = seedEnvironmentSchema.safeParse(process.env);

    if (!seedEnvironment.success) {
        if (process.env.NODE_ENV !== "development") {
            throw new DevelopmentSeedError(
                "Refusing to seed admin credentials outside development.",
            );
        }

        throw new DevelopmentSeedError(
            "Set DEV_ADMIN_PASSWORD to a development-only password before seeding.",
        );
    }

    const [mongo, organisationModule, userModule, passwordModule, userTypes] =
        await Promise.all([
            import("../shared/lib/mongo.js"),
            import("../features/organisations/organisation.model.js"),
            import("../features/users/user.model.js"),
            import("../shared/security/password.js"),
            import("../features/users/user.types.js"),
        ]);
    const password = passwordModule.validateNewPassword(
        seedEnvironment.data.DEV_ADMIN_PASSWORD,
    );

    await mongo.connectMongo();

    try {
        await Promise.all([
            organisationModule.OrganisationModel.init(),
            userModule.UserModel.init(),
        ]);

        let organisation = await organisationModule.OrganisationModel.findOne({
            slug: DEMO_ORGANISATION_SLUG,
        }).exec();

        if (organisation === null) {
            organisation = await organisationModule.OrganisationModel.create({
                name: "ProxiAI Demo",
                slug: DEMO_ORGANISATION_SLUG,
                status: "ACTIVE",
                plan: "FREE",
                monthlyTokenBudget: DEMO_MONTHLY_TOKEN_BUDGET,
                policy: {
                    maskThreshold: 20,
                    blockThreshold: 60,
                },
            });
        } else if (organisation.status !== "ACTIVE") {
            organisation.status = "ACTIVE";
            await organisation.save();
        }

        const emailNormalized = DEMO_ADMIN_EMAIL.toLowerCase();
        let admin = await userModule.UserModel.findOne({
            orgId: organisation.orgId,
            emailNormalized,
        })
            .select("+emailNormalized +passwordHash")
            .exec();

        if (admin === null) {
            admin = await userModule.UserModel.create({
                orgId: organisation.orgId,
                email: DEMO_ADMIN_EMAIL,
                passwordHash: await passwordModule.hashPassword(password),
                displayName: DEMO_ADMIN_DISPLAY_NAME,
                role: "ORG_ADMIN",
                permissions: [...userTypes.USER_PERMISSIONS],
                status: "ACTIVE",
            });
        } else {
            let changed = false;
            let passwordMatches = false;

            try {
                passwordMatches = await passwordModule.verifyPassword(
                    admin.passwordHash,
                    password,
                );
            } catch {
                passwordMatches = false;
            }

            if (!passwordMatches) {
                admin.passwordHash = await passwordModule.hashPassword(password);
                changed = true;
            }

            if (admin.displayName !== DEMO_ADMIN_DISPLAY_NAME) {
                admin.displayName = DEMO_ADMIN_DISPLAY_NAME;
                changed = true;
            }

            if (admin.role !== "ORG_ADMIN") {
                admin.role = "ORG_ADMIN";
                changed = true;
            }

            if (admin.status !== "ACTIVE") {
                admin.status = "ACTIVE";
                changed = true;
            }

            const canonicalPermissions = [...userTypes.USER_PERMISSIONS];
            const currentPermissions = admin.permissions;
            if (
                currentPermissions.length !== canonicalPermissions.length
                || canonicalPermissions.some(
                    (permission) => !currentPermissions.includes(permission),
                )
            ) {
                admin.permissions = canonicalPermissions;
                changed = true;
            }

            if (changed) {
                await admin.save();
            }
        }

        process.stdout.write(
            [
                `Organisation slug: ${DEMO_ORGANISATION_SLUG}`,
                `Email: ${DEMO_ADMIN_EMAIL}`,
                `Password: ${password}`,
                "",
            ].join("\n"),
        );
    } finally {
        await mongo.disconnectMongo();
    }
}

try {
    await seedDevelopmentAdmin();
} catch (error: unknown) {
    const message = error instanceof DevelopmentSeedError
        ? error.message
        : "Development admin provisioning failed.";

    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
}
