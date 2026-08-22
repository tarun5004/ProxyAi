import { z } from "zod";

import {
    USER_PERMISSIONS_BY_ROLE,
} from "../features/users/user.types.js";

export const DEMO_ORGANISATION = Object.freeze({
    name: "NovaStack Technologies",
    slug: "novastack",
});

export const DEMO_PUBLIC_USER = Object.freeze({
    displayName: "NovaStack Demo User",
    email: "demo@novastack.demo",
    permissions: USER_PERMISSIONS_BY_ROLE.EMPLOYEE,
    role: "EMPLOYEE" as const,
});

export const DEMO_PRIVATE_ADMIN = Object.freeze({
    displayName: "NovaStack Admin Demo",
    email: "admin-demo@novastack.demo",
    permissions: USER_PERMISSIONS_BY_ROLE.ORG_ADMIN,
    role: "ORG_ADMIN" as const,
});

export const LEGACY_PRIVILEGED_DEMO_EMAILS = Object.freeze([
    "admin@novastack.demo",
    "lead.engineering@novastack.demo",
] as const);

const demoSeedEnvironmentSchema = z.object({
    DEMO_SEED_ENABLED: z.literal("true"),
    DEMO_PUBLIC_PASSWORD: z.string().min(1),
    DEMO_SEED_RESET_PASSWORDS: z.enum(["true", "false"]).default("false"),
    MONGO_URI: z.string().min(1),
});

export interface DemoSeedEnvironment {
    readonly mongoUri: string;
    readonly publicPassword: string;
    readonly resetPasswords: boolean;
}

export function parseDemoSeedEnvironment(
    environment: NodeJS.ProcessEnv,
): DemoSeedEnvironment {
    const result = demoSeedEnvironmentSchema.safeParse(environment);

    if (!result.success) {
        if (environment.DEMO_SEED_ENABLED !== "true") {
            throw new Error(
                "Refusing to seed demo data. Set DEMO_SEED_ENABLED=true explicitly.",
            );
        }

        throw new Error(
            "Demo seed requires MONGO_URI and DEMO_PUBLIC_PASSWORD.",
        );
    }

    return Object.freeze({
        mongoUri: result.data.MONGO_URI,
        publicPassword: result.data.DEMO_PUBLIC_PASSWORD,
        resetPasswords: result.data.DEMO_SEED_RESET_PASSWORDS === "true",
    });
}
