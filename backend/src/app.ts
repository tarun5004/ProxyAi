import cors from "cors";
import express from "express";
import helmet from "helmet";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health/live", (_req, res) => {
    res.status(200).json({
        success: true,
        data: {
            status: "alive",
            service: "ProxyAi-api",
        }
    });
});
