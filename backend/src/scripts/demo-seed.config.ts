import { z } from "zod";

import {
    DEMO_ORGANISATION,
    DEMO_PRIVATE_ADMIN,
    DEMO_PUBLIC_USER,
    LEGACY_PRIVILEGED_DEMO_EMAILS,
} from "../shared/demo/demo-identities.js";

export {
    DEMO_ORGANISATION,
    DEMO_PRIVATE_ADMIN,
    DEMO_PUBLIC_USER,
    LEGACY_PRIVILEGED_DEMO_EMAILS,
};

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
