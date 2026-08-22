import { Router } from "express";

import { login, logout, me, refresh } from "./auth.controller.js";
import { authenticateRequest } from "./auth.middleware.js";
import { demoAdmin } from "./demo-admin.controller.js";

export const authRouter = Router();

authRouter.post("/login", login);
authRouter.post("/demo-admin", demoAdmin);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", authenticateRequest, me);
