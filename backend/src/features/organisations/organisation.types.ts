import type { HydratedDocument } from "mongoose";

export const ORGANISATION_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export const ORGANISATION_PLANS = ["FREE", "PRO", "ENTERPRISE"] as const;
export const RETENTION_MODES = [
    "METADATA_ONLY",
    "ENCRYPTED_STORAGE",
] as const;

export type OrganisationStatus = (typeof ORGANISATION_STATUSES)[number];
export type OrganisationPlan = (typeof ORGANISATION_PLANS)[number];
export type RetentionMode = (typeof RETENTION_MODES)[number];

export interface OrganisationRetention {
    mode: RetentionMode;
}

export interface OrganisationPolicy {
    maskThreshold: number;
    blockThreshold: number;
}

export interface OrganisationFeatureFlags {
    autoRouting: boolean;
    teamLeadView: boolean;
    anomalyDetection: boolean;
    auditExport: boolean;
}

export interface Organisation {
    orgId: string;
    name: string;
    slug: string;
    status: OrganisationStatus;
    plan: OrganisationPlan;
    monthlyTokenBudget: number;
    retention: OrganisationRetention;
    policy: OrganisationPolicy;
    featureFlags: OrganisationFeatureFlags;
    createdAt: Date;
    updatedAt: Date;
}

export type OrganisationDocument = HydratedDocument<Organisation>;
