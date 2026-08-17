import { Router } from "express";

import { authenticateRequest } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/authorization.middleware.js";
import { streamChat } from "./chat.controller.js";

export const chatRouter = Router();

chatRouter.post(
    "/stream",
    authenticateRequest,
    requirePermission("chat:send"),
    streamChat,
);
