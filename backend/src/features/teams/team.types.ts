import type { HydratedDocument } from "mongoose";

export interface Team {
    teamId: string;
    orgId: string;
    name: string;
    nameNormalized: string;
    description?: string;
    isActive: boolean;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export type TeamDocument = HydratedDocument<Team>;
