import type { Logger } from "pino";
import type {
    UserPermission,
    UserRole,
} from "../features/users/user.types.js";

export interface AuthContext {
    userId: string;
    orgId: string;
    role: UserRole;
    permissions: UserPermission[];
    sessionId: string;
}

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
