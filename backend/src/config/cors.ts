import type { CorsOptions } from "cors";

import { AppError } from "../shared/errors/app-error.js";
import { env } from "./env.js";

export const corsOptions: CorsOptions = {
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-ID"],
    credentials: true,
    exposedHeaders: ["X-Request-ID"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin(origin, callback) {
        if (origin === undefined || origin === env.FRONTEND_ORIGIN) {
            callback(null, true);
            return;
        }

        callback(
            new AppError(403, "CORS_ORIGIN_DENIED", "Origin is not allowed."),
        );
    },
};
