import type { Logger } from "pino";
import type { AuthContext } from "../features/auth/auth-context.types.js";

declare global {
    namespace Express {
        interface Request {
            auth?: AuthContext;
            log: Logger;
            requestId: string;
        }
    }
}

export {};
