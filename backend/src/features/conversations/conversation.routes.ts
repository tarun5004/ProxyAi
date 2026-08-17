import { Router } from "express";

import { authenticateRequest } from "../auth/auth.middleware.js";
import { requirePermission } from "../auth/authorization.middleware.js";
import {
    createConversation,
    getConversation,
    listConversations,
} from "./conversation.controller.js";

export const conversationRouter = Router();

conversationRouter.post(
    "/",
    authenticateRequest,
    requirePermission("chat:send"),
    createConversation,
);
conversationRouter.get(
    "/",
    authenticateRequest,
    requirePermission("chat:view_own"),
    listConversations,
);
conversationRouter.get(
    "/:conversationId",
    authenticateRequest,
    requirePermission("chat:view_own"),
    getConversation,
);
