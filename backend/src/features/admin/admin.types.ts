import type { ProviderHealthState } from "../providers/provider-health.store.js";
import type { ProviderId } from "../providers/provider.types.js";
import type {
    UserPermission,
    UserRole,
    UserStatus,
} from "../users/user.types.js";

export const ADMIN_PERIODS = ["today", "7d", "30d", "month"] as const;
export type AdminPeriod = (typeof ADMIN_PERIODS)[number];

export interface AdminListCursor {
    readonly createdAt: Date;
    readonly id: string;
}

export interface AdminRequestLogItem {
    readonly requestId: string;
    readonly userId: string;
    readonly status: "COMPLETED" | "BLOCKED" | "FAILED" | "INTERRUPTED";
    readonly policyAction: "ALLOW" | "ALLOW_WITH_MASK" | "BLOCK";
    readonly providerId?: ProviderId;
    readonly model?: string;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
    readonly createdAt: Date;
}

export interface AdminUserItem {
    readonly userId: string;
    readonly email: string;
    readonly displayName: string;
    readonly role: UserRole;
    readonly permissions: readonly UserPermission[];
    readonly teamId?: string;
    readonly status: UserStatus;
    readonly lastLoginAt?: Date;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface AdminTeamItem {
    readonly teamId: string;
    readonly name: string;
    readonly description?: string;
    readonly isActive: boolean;
    readonly createdBy: string;
    readonly memberCount: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface AdminAlertItem {
    readonly alertId: string;
    readonly userId: string;
    readonly observedDay: string;
    readonly type: "ANOMALY";
    readonly severity: "HIGH";
    readonly title: "Daily token usage anomaly";
    readonly message: "Daily token usage exceeded the approved rolling baseline.";
    readonly metadata: {
        readonly observedTokens: number;
        readonly baselineAverageTokens: number;
        readonly baselineActiveDays: number;
        readonly baselineWindowStart: string;
        readonly baselineWindowEnd: string;
        readonly thresholdMultiplier: 2;
    };
    readonly status: "OPEN" | "RESOLVED";
    readonly resolvedAt?: Date;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface AdminProviderHealthItem {
    readonly providerId: ProviderId;
    readonly state: ProviderHealthState;
    readonly checkedAt?: string;
}

export interface AdminPage<T> {
    readonly items: readonly T[];
    readonly nextCursor: string | null;
}
