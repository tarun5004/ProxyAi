import { Router } from "express";

import { authenticateRequest } from "../auth/auth.middleware.js";
import {
    rejectPublicDemoAdminMutation,
    requirePermission,
} from "../auth/authorization.middleware.js";
import {
    adminAlerts,
    adminAudit,
    adminBilling,
    adminChangeUserRole,
    adminChangeUserStatus,
    adminChangeUserTeam,
    adminExportAudit,
    adminLogs,
    adminRevokeUserSessions,
    adminSummary,
    adminTeams,
    adminUpdateAlert,
    adminUpdatePolicy,
    adminUpdateRetention,
    adminUsers,
} from "./admin.controller.js";

export const adminRouter = Router();

adminRouter.use(authenticateRequest);
adminRouter.get("/summary", requirePermission("admin:view_logs"), adminSummary);
adminRouter.get("/logs", requirePermission("admin:view_logs"), adminLogs);
adminRouter.get("/audit", requirePermission("admin:view_logs"), adminAudit);
adminRouter.get("/billing", requirePermission("admin:view_billing"), adminBilling);
adminRouter.get("/alerts", requirePermission("admin:view_logs"), adminAlerts);
adminRouter.get("/users", requirePermission("admin:manage_users"), adminUsers);
adminRouter.get("/teams", requirePermission("admin:manage_users"), adminTeams);
adminRouter.patch(
    "/users/:userId/role",
    requirePermission("admin:manage_users"),
    rejectPublicDemoAdminMutation,
    adminChangeUserRole,
);
adminRouter.patch(
    "/users/:userId/team",
    requirePermission("admin:manage_users"),
    rejectPublicDemoAdminMutation,
    adminChangeUserTeam,
);
adminRouter.patch(
    "/users/:userId/status",
    requirePermission("admin:manage_users"),
    rejectPublicDemoAdminMutation,
    adminChangeUserStatus,
);
adminRouter.post(
    "/users/:userId/revoke-sessions",
    requirePermission("admin:manage_users"),
    rejectPublicDemoAdminMutation,
    adminRevokeUserSessions,
);
adminRouter.patch(
    "/policy",
    requirePermission("admin:configure_policy"),
    rejectPublicDemoAdminMutation,
    adminUpdatePolicy,
);
adminRouter.patch(
    "/retention",
    requirePermission("admin:configure_policy"),
    rejectPublicDemoAdminMutation,
    adminUpdateRetention,
);
adminRouter.patch(
    "/alerts/:alertId",
    requirePermission("admin:view_logs"),
    rejectPublicDemoAdminMutation,
    adminUpdateAlert,
);
adminRouter.get(
    "/audit/export",
    requirePermission("admin:export_audit"),
    rejectPublicDemoAdminMutation,
    adminExportAudit,
);
