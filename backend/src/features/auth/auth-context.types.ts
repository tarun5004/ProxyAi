import type {
    UserPermission,
    UserRole,
} from "../users/user.types.js";

export interface AuthContext {
    userId: string;
    orgId: string;
    role: UserRole;
    permissions: UserPermission[];
    sessionId: string;
    teamId?: string;
}
