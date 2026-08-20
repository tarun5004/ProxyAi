import { Router } from "express";

import { authenticateRequest } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/authorization.middleware.js";
import {
    adminAlerts,
    adminBilling,
    adminLogs,
    adminSummary,
    adminTeams,
    adminUsers,
} from "./admin.controller.js";

export const adminRouter = Router();

adminRouter.use(authenticateRequest);
adminRouter.get("/summary", requirePermission("admin:view_logs"), adminSummary);
adminRouter.get("/logs", requirePermission("admin:view_logs"), adminLogs);
adminRouter.get("/billing", requirePermission("admin:view_billing"), adminBilling);
adminRouter.get("/alerts", requirePermission("admin:view_logs"), adminAlerts);
adminRouter.get("/users", requirePermission("admin:manage_users"), adminUsers);
adminRouter.get("/teams", requirePermission("admin:manage_users"), adminTeams);
