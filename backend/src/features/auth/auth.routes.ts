import { Router } from "express";

import { login, logout, me, refresh } from "./auth.controller.js";
import { authenticateRequest } from "./auth.middleware.js";

export const authRouter = Router();

authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", authenticateRequest, logout);
authRouter.get("/me", authenticateRequest, me);
