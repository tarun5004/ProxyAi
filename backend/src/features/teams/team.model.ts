import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import type { Model } from "mongoose";

import type { Team } from "./team.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { model, models, Schema } = mongoose;

const teamSchema = new Schema<Team>(
    {
        teamId: {
            type: String,
            default: () => randomUUID(),
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        orgId: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
        name: {
            type: String,
            trim: true,
            minlength: 1,
            maxlength: 100,
            required: true,
        },
        nameNormalized: {
            type: String,
            minlength: 1,
            maxlength: 100,
            required: true,
            select: false,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500,
        },
        isActive: {
            type: Boolean,
            default: false,
            required: true,
        },
        createdBy: {
            type: String,
            immutable: true,
            match: UUID_V4_PATTERN,
            required: true,
        },
    },
    {
        collection: "teams",
        strict: "throw",
        timestamps: true,
        toJSON: {
            transform: (_document, returnedObject) => {
                const {
                    nameNormalized: _nameNormalized,
                    ...safeObject
                } = returnedObject;

                return safeObject;
            },
        },
        toObject: {
            transform: (_document, returnedObject) => {
                const {
                    nameNormalized: _nameNormalized,
                    ...safeObject
                } = returnedObject;

                return safeObject;
            },
        },
    },
);

teamSchema.pre("validate", function normalizeTeamName() {
    if (typeof this.name === "string") {
        this.nameNormalized = this.name.trim().toLowerCase();
    }
});

teamSchema.index(
    {
        teamId: 1,
    },
    {
        name: "uniq_teams_team_id",
        unique: true,
    },
);
teamSchema.index(
    {
        orgId: 1,
        nameNormalized: 1,
    },
    {
        name: "uniq_teams_org_name_normalized",
        unique: true,
    },
);
teamSchema.index(
    {
        orgId: 1,
        isActive: 1,
    },
    {
        name: "idx_teams_org_active",
    },
);

const existingTeamModel = models.Team as Model<Team> | undefined;

export const TeamModel =
    existingTeamModel
    ?? model<Team>("Team", teamSchema);
