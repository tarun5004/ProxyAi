import type { Logger } from "pino";
import type { AuthContext } from "../features/auth/auth-context.types.js";
import type { LoginResponseUser } from "../features/auth/auth.types.js";

declare global {
    namespace Express {
        interface Request {
            auth?: AuthContext;
            authProfile?: LoginResponseUser;
            log: Logger;
            requestId: string;
        }
    }
}

export {};
