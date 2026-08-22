import { USER_PERMISSIONS_BY_ROLE } from "../../features/users/user.types.js";

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
