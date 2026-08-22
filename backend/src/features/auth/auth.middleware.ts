import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import {
    USER_PERMISSIONS,
    type UserPermission,
} from "../users/user.types.js";
import {
    findOrganisationByOrgId,
    findUserByOrgIdAndUserId,
} from "./auth.repository.js";
import { verifyAccessToken } from "./token.service.js";
import { createSafeAuthProfile } from "./auth-profile.js";

const userPermissionSet = new Set<string>(USER_PERMISSIONS);

function createUnauthorizedError(): AppError {
    return new AppError(
        401,
        "UNAUTHORIZED",
        "Authentication required.",
    );
}

function extractBearerToken(
    authorizationHeader: string | undefined,
): string | undefined {
    if (!authorizationHeader) {
        return undefined;
    }

    const [scheme, token, extra] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token || extra !== undefined) {
        return undefined;
    }

    return token;
}

function isValidCurrentPermission(
    permission: string,
): permission is UserPermission {
    return userPermissionSet.has(permission);
}

export async function authenticateRequest(
    request: Request,
    _response: Response,
    next: NextFunction,
): Promise<void> {
    const accessToken = extractBearerToken(
        request.headers.authorization,
    );

    if (!accessToken) {
        next(createUnauthorizedError());
        return;
    }

    const claims = await verifyAccessToken(accessToken);

    if (!claims) {
        next(createUnauthorizedError());
        return;
    }

    let user;
    let organisation;

    try {
        [user, organisation] = await Promise.all([
            findUserByOrgIdAndUserId(claims.orgId, claims.userId),
            findOrganisationByOrgId(claims.orgId),
        ]);
    } catch {
        next(
            new AppError(
                503,
                "AUTH_TEMPORARILY_UNAVAILABLE",
                "Authentication is temporarily unavailable.",
            ),
        );
        return;
    }

    if (
        !user
        || !organisation
        || user.status !== "ACTIVE"
        || organisation.status !== "ACTIVE"
        || !user.permissions.every(isValidCurrentPermission)
    ) {
        next(createUnauthorizedError());
        return;
    }

    request.auth = {
        userId: user.userId,
        orgId: claims.orgId,
        role: user.role,
        permissions: [...user.permissions],
        sessionId: claims.sessionId,
        sessionMode: claims.sessionMode,
        ...(user.teamId === undefined
            ? {}
            : {
                teamId: user.teamId,
            }),
    };
    request.authProfile = createSafeAuthProfile(user, organisation);

    next();
}
