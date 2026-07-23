import cors from "cors";
import express from "express";
import helmet from "helmet";

import { corsOptions } from "./config/cors.js";
import { healthRouter } from "./features/health/health.routes.js";
import { globalErrorHandler } from "./shared/middleware/error.middleware.js";
import { notFoundHandler } from "./shared/middleware/not-found.middleware.js";
import { requestIdMiddleware } from "./shared/middleware/request-id.middleware.js";

export const app = express();

app.disable("x-powered-by");

app.use(requestIdMiddleware);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use("/health", healthRouter);
app.use(notFoundHandler);
app.use(globalErrorHandler);
