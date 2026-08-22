export const PUBLIC_DEMO_LOGIN = Object.freeze({
    email: "demo@novastack.demo",
    href: "/login?demo=public",
    organisationSlug: "novastack",
});

export interface PublicDemoLoginDefaults {
    readonly email: string;
    readonly organisationSlug: string;
}

export function getPublicDemoLoginDefaults(
    demo: string | string[] | undefined,
): PublicDemoLoginDefaults | undefined {
    if (demo !== "public") {
        return undefined;
    }

    return {
        email: PUBLIC_DEMO_LOGIN.email,
        organisationSlug: PUBLIC_DEMO_LOGIN.organisationSlug,
    };
}
