import { Router } from "express";

import { login, me, refresh } from "./auth.controller.js";
import { authenticateRequest } from "./auth.middleware.js";

export const authRouter = Router();

authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.get("/me", authenticateRequest, me);
