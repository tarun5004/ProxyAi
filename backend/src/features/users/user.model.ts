import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import type { Model } from "mongoose";

import {
    USER_PERMISSIONS,
    USER_ROLES,
    USER_STATUSES,
} from "./user.types.js";
import type {
    User,
    UserPermission,
} from "./user.types.js";

const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const { model, models, Schema } = mongoose;

const userSchema = new Schema<User>(
    {
        userId: {
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
        email: {
            type: String,
            trim: true,
            maxlength: 254,
            match: EMAIL_PATTERN,
            required: true,
        },
        emailNormalized: {
            type: String,
            maxlength: 254,
            required: true,
            select: false,
        },
        passwordHash: {
            type: String,
            minlength: 1,
            maxlength: 512,
            required: true,
            select: false,
        },
        displayName: {
            type: String,
            trim: true,
            minlength: 1,
            maxlength: 120,
            required: true,
        },
        role: {
            type: String,
            enum: USER_ROLES,
            required: true,
        },
        permissions: {
            type: [
                {
                    type: String,
                    enum: USER_PERMISSIONS,
                },
            ],
            default: () => [],
            required: true,
            validate: {
                validator(permissions: UserPermission[]): boolean {
                    return permissions.length <= USER_PERMISSIONS.length
                        && new Set(permissions).size === permissions.length;
                },
                message:
                    "permissions must contain unique allowlisted values.",
            },
        },
        teamId: {
            type: String,
            match: UUID_V4_PATTERN,
        },
        status: {
            type: String,
            enum: USER_STATUSES,
            default: "DISABLED",
            required: true,
        },
        failedLoginCount: {
            type: Number,
            default: 0,
            min: 0,
            required: true,
            select: false,
            validate: {
                validator: Number.isSafeInteger,
                message: "failedLoginCount must be a safe integer.",
            },
        },
        lockedUntil: {
            type: Date,
            select: false,
        },
        lastLoginAt: {
            type: Date,
        },
    },
    {
        collection: "users",
        strict: "throw",
        timestamps: true,
        toJSON: {
            transform: (_document, returnedObject) => {
                const {
                    emailNormalized: _emailNormalized,
                    failedLoginCount: _failedLoginCount,
                    lockedUntil: _lockedUntil,
                    passwordHash: _passwordHash,
                    ...safeObject
                } = returnedObject;

                return safeObject;
            },
        },
        toObject: {
            transform: (_document, returnedObject) => {
                const {
                    emailNormalized: _emailNormalized,
                    failedLoginCount: _failedLoginCount,
                    lockedUntil: _lockedUntil,
                    passwordHash: _passwordHash,
                    ...safeObject
                } = returnedObject;

                return safeObject;
            },
        },
    },
);

userSchema.pre("validate", function normalizeUserEmail() {
    if (typeof this.email === "string") {
        this.emailNormalized = this.email.trim().toLowerCase();
    }
});

userSchema.pre("validate", function validateActiveTeamLeadAssignment() {
    if (
        this.status === "ACTIVE"
        && this.role === "TEAM_LEAD"
        && !this.teamId
    ) {
        this.invalidate(
            "teamId",
            "An active team lead must belong to a team.",
        );
    }
});

userSchema.index(
    {
        userId: 1,
    },
    {
        name: "uniq_users_user_id",
        unique: true,
    },
);
userSchema.index(
    {
        orgId: 1,
        emailNormalized: 1,
    },
    {
        name: "uniq_users_org_email_normalized",
        unique: true,
    },
);
userSchema.index(
    {
        orgId: 1,
        teamId: 1,
        status: 1,
    },
    {
        name: "idx_users_org_team_status",
    },
);
userSchema.index(
    {
        orgId: 1,
        role: 1,
        status: 1,
    },
    {
        name: "idx_users_org_role_status",
    },
);

const existingUserModel = models.User as Model<User> | undefined;

export const UserModel =
    existingUserModel
    ?? model<User>("User", userSchema);
