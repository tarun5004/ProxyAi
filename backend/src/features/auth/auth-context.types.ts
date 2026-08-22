import type {
    UserPermission,
    UserRole,
} from "../users/user.types.js";
import type { AuthSessionMode } from "./auth.types.js";

export interface AuthContext {
    userId: string;
    orgId: string;
    role: UserRole;
    permissions: UserPermission[];
    sessionId: string;
    sessionMode: AuthSessionMode;
    teamId?: string;
}
