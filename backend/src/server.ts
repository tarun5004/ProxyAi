import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./shared/lib/logger.js";

app.listen(env.PORT, () => {
    logger.info(
        {
            event: "app.started",
            port: env.PORT,
        },
        "ProxiAI API started",
    );
});
