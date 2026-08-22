import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import type { AuthContext } from "./auth-context.types.js";
import {
    USER_PERMISSIONS,
    type UserPermission,
} from "../users/user.types.js";

const userPermissionSet = new Set<string>(USER_PERMISSIONS);

function createUnauthorizedError(): AppError {
    return new AppError(
        401,
        "UNAUTHORIZED",
        "Authentication required.",
    );
}

function createForbiddenError(): AppError {
    return new AppError(
        403,
        "FORBIDDEN",
        "Access denied.",
    );
}

function isUserPermission(
    permission: string,
): permission is UserPermission {
    return userPermissionSet.has(permission);
}

export function requirePermission(
    permission: UserPermission,
): RequestHandler {
    if (!isUserPermission(permission)) {
        throw new Error("Invalid permission guard configuration.");
    }

    return (
        request: Request,
        _response: Response,
        next: NextFunction,
    ): void => {
        if (!request.auth) {
            next(createUnauthorizedError());
            return;
        }

        if (!request.auth.permissions.includes(permission)) {
            next(createForbiddenError());
            return;
        }

        next();
    };
}

export function rejectPublicDemoAdminMutation(
    request: Request,
    _response: Response,
    next: NextFunction,
): void {
    if (!request.auth) {
        next(createUnauthorizedError());
        return;
    }

    if (request.auth.sessionMode === "PUBLIC_ADMIN_DEMO") {
        next(
            new AppError(
                403,
                "PUBLIC_DEMO_READ_ONLY",
                "Administrative changes are disabled in public demo mode.",
            ),
        );
        return;
    }

    next();
}

export function assertOrganisationScope(
    auth: AuthContext | undefined,
    trustedResourceOrgId: string,
): void {
    if (!auth) {
        throw createUnauthorizedError();
    }

    if (auth.orgId !== trustedResourceOrgId) {
        throw createForbiddenError();
    }
}

export function assertTeamScope(
    auth: AuthContext | undefined,
    trustedResource: {
        orgId: string;
        teamId: string;
    },
): void {
    assertOrganisationScope(auth, trustedResource.orgId);

    if (!auth?.teamId || auth.teamId !== trustedResource.teamId) {
        throw createForbiddenError();
    }
}
