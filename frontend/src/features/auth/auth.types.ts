import { z } from "zod";

export const userRoleSchema = z.enum(["EMPLOYEE", "TEAM_LEAD", "ORG_ADMIN"]);
export const userPermissionSchema = z.enum([
    "chat:send",
    "chat:view_own",
    "team:view_logs",
    "admin:view_logs",
    "admin:view_billing",
    "admin:manage_users",
    "admin:configure_policy",
    "admin:export_audit",
]);

export const loginInputSchema = z.object({
    organisationSlug: z.string().trim().min(2).max(63),
    email: z.string().trim().email(),
    password: z.string().min(1),
});

export const authContextSchema = z.object({
    userId: z.string().uuid(),
    orgId: z.string().uuid(),
    role: userRoleSchema,
    permissions: z.array(userPermissionSchema),
    sessionId: z.string().uuid(),
    teamId: z.string().uuid().optional(),
});

export const loginUserSchema = z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
    role: userRoleSchema,
    permissions: z.array(userPermissionSchema),
    teamId: z.string().uuid().optional(),
    organisation: z.object({
        orgId: z.string().uuid(),
        name: z.string(),
        plan: z.enum(["FREE", "PRO", "ENTERPRISE"]),
    }),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type AuthContext = z.infer<typeof authContextSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
