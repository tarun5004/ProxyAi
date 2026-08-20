import mongoose from "mongoose";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";

import { OrganisationModel } from "../features/organisations/organisation.model.js";
import { TeamModel } from "../features/teams/team.model.js";
import { UserModel } from "../features/users/user.model.js";

const ORG_SLUG = "novastack";
const ORG_NAME = "NovaStack Technologies";

const ADMIN_EMAIL = "admin@novastack.demo";
const LEAD_EMAIL = "lead.engineering@novastack.demo";
const EMPLOYEE_EMAILS = [
    "rahul@novastack.demo",
    "priya@novastack.demo",
    "arjun@novastack.demo",
];

const ALL_ADMIN_PERMISSIONS = [
    "chat:send",
    "chat:view_own",
    "team:view_logs",
    "admin:view_logs",
    "admin:view_billing",
    "admin:manage_users",
    "admin:configure_policy",
    "admin:export_audit",
] as const;

const TEAM_LEAD_PERMISSIONS = [
    "chat:send",
    "chat:view_own",
    "team:view_logs",
] as const;

const EMPLOYEE_PERMISSIONS = [
    "chat:send",
    "chat:view_own",
] as const;

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

async function hashPassword(password: string): Promise<string> {
    const normalized = password.normalize("NFC");
    const codePointLength = [...normalized].length;

    if (codePointLength < 15 || codePointLength > 128) {
        throw new Error(
            "DEMO_ADMIN_PASSWORD must be between 15 and 128 Unicode code points.",
        );
    }

    return argon2.hash(normalized, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
        hashLength: 32,
    });
}

async function upsertUser(input: {
    orgId: string;
    email: string;
    displayName: string;
    role: "ORG_ADMIN" | "TEAM_LEAD" | "EMPLOYEE";
    permissions: readonly string[];
    passwordHash: string;
    teamId?: string;
}) {
    const emailNormalized = input.email.trim().toLowerCase();

    const existing = await UserModel.findOne({
        orgId: input.orgId,
        emailNormalized,
    }).select("+passwordHash");

    if (existing) {
        existing.displayName = input.displayName;
        existing.role = input.role;
        existing.permissions = [...input.permissions];
        existing.status = "ACTIVE";
        existing.passwordHash = input.passwordHash;

        if (input.teamId !== undefined) {
            existing.teamId = input.teamId;
        } else {
            existing.teamId = undefined;
        }

        await existing.save();
        return { user: existing, created: false };
    }

    const user = await UserModel.create({
        userId: randomUUID(),
        orgId: input.orgId,
        email: input.email,
        emailNormalized,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        role: input.role,
        permissions: [...input.permissions],
        ...(input.teamId ? { teamId: input.teamId } : {}),
        status: "ACTIVE",
        failedLoginCount: 0,
    });

    return { user, created: true };
}

async function main() {
    if (process.env.DEMO_SEED_ENABLED !== "true") {
        throw new Error(
            "Refusing to seed demo data. Set DEMO_SEED_ENABLED=true explicitly.",
        );
    }

    const mongoUri = requireEnv("MONGO_URI");
    const demoPassword = requireEnv("DEMO_ADMIN_PASSWORD");
    const passwordHash = await hashPassword(demoPassword);

    await mongoose.connect(mongoUri);

    try {
        await Promise.all([
            OrganisationModel.init(),
            TeamModel.init(),
            UserModel.init(),
        ]);

        let organisation = await OrganisationModel.findOne({ slug: ORG_SLUG });
        let organisationCreated = false;

        if (!organisation) {
            organisation = await OrganisationModel.create({
                orgId: randomUUID(),
                name: ORG_NAME,
                slug: ORG_SLUG,
                status: "ACTIVE",
                plan: "PRO",
                monthlyTokenBudget: 100_000,
                retention: { mode: "METADATA_ONLY" },
                policy: {
                    maskThreshold: 40,
                    blockThreshold: 70,
                },
                featureFlags: {
                    autoRouting: false,
                    teamLeadView: true,
                    anomalyDetection: true,
                    auditExport: false,
                },
            });
            organisationCreated = true;
        } else {
            organisation.name = ORG_NAME;
            organisation.status = "ACTIVE";
            organisation.plan = "PRO";
            organisation.monthlyTokenBudget = 100_000;
            organisation.retention = { mode: "METADATA_ONLY" };
            organisation.policy = {
                maskThreshold: 40,
                blockThreshold: 70,
            };
            organisation.featureFlags = {
                autoRouting: false,
                teamLeadView: true,
                anomalyDetection: true,
                auditExport: false,
            };
            await organisation.save();
        }

        const adminResult = await upsertUser({
            orgId: organisation.orgId,
            email: ADMIN_EMAIL,
            displayName: "Ananya Mehta",
            role: "ORG_ADMIN",
            permissions: ALL_ADMIN_PERMISSIONS,
            passwordHash,
        });

        const adminUserId = adminResult.user.userId;

        async function upsertTeam(name: string, description: string) {
            const existing = await TeamModel.findOne({
                orgId: organisation!.orgId,
                name,
            });

            if (existing) {
                existing.description = description;
                existing.isActive = true;
                await existing.save();
                return { team: existing, created: false };
            }

            const team = await TeamModel.create({
                teamId: randomUUID(),
                orgId: organisation!.orgId,
                name,
                description,
                isActive: true,
                createdBy: adminUserId,
            });

            return { team, created: true };
        }

        const engineering = await upsertTeam(
            "Engineering",
            "Platform, backend and AI infrastructure.",
        );

        const product = await upsertTeam(
            "Product",
            "Product management and enterprise AI workflows.",
        );

        const leadResult = await upsertUser({
            orgId: organisation.orgId,
            email: LEAD_EMAIL,
            displayName: "Vikram Sethi",
            role: "TEAM_LEAD",
            permissions: TEAM_LEAD_PERMISSIONS,
            passwordHash,
            teamId: engineering.team.teamId,
        });

        const employees = [
            {
                email: EMPLOYEE_EMAILS[0],
                displayName: "Rahul Verma",
                teamId: engineering.team.teamId,
            },
            {
                email: EMPLOYEE_EMAILS[1],
                displayName: "Priya Nair",
                teamId: product.team.teamId,
            },
            {
                email: EMPLOYEE_EMAILS[2],
                displayName: "Arjun Kapoor",
                teamId: engineering.team.teamId,
            },
        ];

        const employeeResults = [];
        for (const employee of employees) {
            employeeResults.push(
                await upsertUser({
                    orgId: organisation.orgId,
                    email: employee.email,
                    displayName: employee.displayName,
                    role: "EMPLOYEE",
                    permissions: EMPLOYEE_PERMISSIONS,
                    passwordHash,
                    teamId: employee.teamId,
                }),
            );
        }

        const usersCreated =
            Number(adminResult.created)
            + Number(leadResult.created)
            + employeeResults.filter((item) => item.created).length;

        const teamsCreated =
            Number(engineering.created) + Number(product.created);

        console.log("Demo seed complete.");
        console.log(`Organisation: ${ORG_NAME} (${ORG_SLUG})`);
        console.log(`Organisation created: ${organisationCreated ? "yes" : "no"}`);
        console.log(`Teams created this run: ${teamsCreated}`);
        console.log(`Users created this run: ${usersCreated}`);
        console.log("Demo login emails:");
        console.log(`- ${ADMIN_EMAIL} (ORG_ADMIN)`);
        console.log(`- ${LEAD_EMAIL} (TEAM_LEAD)`);
        for (const email of EMPLOYEE_EMAILS) {
            console.log(`- ${email} (EMPLOYEE)`);
        }
        console.log(
            "Password: value supplied via DEMO_ADMIN_PASSWORD (not printed).",
        );
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(async (error) => {
    console.error(
        error instanceof Error ? error.message : "Demo seed failed.",
    );

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => undefined);
    }

    process.exitCode = 1;
});