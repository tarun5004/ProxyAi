import cors from "cors";
import express from "express";
import helmet from "helmet";

import { healthRouter } from "./features/health/health.routes.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/health", healthRouter);
