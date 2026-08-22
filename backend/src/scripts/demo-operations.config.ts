import { z } from "zod";

const sharedEnvironmentSchema = z.object({
    MONGO_URI: z.string().min(1),
});

const publicDemoResetEnvironmentSchema = sharedEnvironmentSchema.extend({
    ALLOW_PUBLIC_DEMO_RESET: z.literal("true"),
    DEMO_PUBLIC_PASSWORD: z.string().min(1),
    PUBLIC_DEMO_RESET_APPLY: z.enum(["true", "false"]).default("false"),
});

const privateDemoAdminEnvironmentSchema = sharedEnvironmentSchema.extend({
    ALLOW_DEMO_ADMIN_PROVISIONING: z.literal("true"),
    DEMO_ADMIN_PROVISION_APPLY: z.enum(["true", "false"]).default("false"),
    PROXIAI_DEMO_ADMIN_PASSWORD: z.string().min(1),
});

export interface DemoOperationEnvironment {
    readonly apply: boolean;
    readonly mongoUri: string;
    readonly password: string;
}

export function parsePublicDemoResetEnvironment(
    environment: NodeJS.ProcessEnv,
): DemoOperationEnvironment {
    const result = publicDemoResetEnvironmentSchema.safeParse(environment);

    if (!result.success) {
        if (environment.ALLOW_PUBLIC_DEMO_RESET !== "true") {
            throw new Error(
                "Refusing public demo reset. Set ALLOW_PUBLIC_DEMO_RESET=true explicitly.",
            );
        }

        throw new Error(
            "Public demo reset requires MONGO_URI and DEMO_PUBLIC_PASSWORD.",
        );
    }

    return {
        apply: result.data.PUBLIC_DEMO_RESET_APPLY === "true",
        mongoUri: result.data.MONGO_URI,
        password: result.data.DEMO_PUBLIC_PASSWORD,
    };
}

export function parsePrivateDemoAdminEnvironment(
    environment: NodeJS.ProcessEnv,
): DemoOperationEnvironment {
    const result = privateDemoAdminEnvironmentSchema.safeParse(environment);

    if (!result.success) {
        if (environment.ALLOW_DEMO_ADMIN_PROVISIONING !== "true") {
            throw new Error(
                "Refusing demo admin provisioning. Set ALLOW_DEMO_ADMIN_PROVISIONING=true explicitly.",
            );
        }

        throw new Error(
            "Demo admin provisioning requires MONGO_URI and PROXIAI_DEMO_ADMIN_PASSWORD.",
        );
    }

    return {
        apply: result.data.DEMO_ADMIN_PROVISION_APPLY === "true",
        mongoUri: result.data.MONGO_URI,
        password: result.data.PROXIAI_DEMO_ADMIN_PASSWORD,
    };
}
