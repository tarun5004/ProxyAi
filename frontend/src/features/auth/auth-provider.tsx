"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { ApiError } from "@/lib/errors/api-error";

import {
    loginRequest,
    logoutRequest,
    meRequest,
    refreshRequest,
} from "./auth.api";
import type {
    AuthContext,
    CurrentSession,
    LoginInput,
    LoginUser,
} from "./auth.types";

type AuthStatus = "loading" | "authenticated" | "anonymous" | "unavailable";

export interface AuthState {
    status: AuthStatus;
    accessToken?: string;
    expiresInSeconds?: number;
    context?: AuthContext;
    user?: LoginUser;
}

interface AuthValue extends AuthState {
    login(input: LoginInput): Promise<void>;
    logout(): Promise<void>;
    retrySession(): Promise<void>;
}

const AuthContextObject = createContext<AuthValue | null>(null);
let bootstrapPromise: Promise<AuthState> | undefined;

function getAuthContext(session: CurrentSession): AuthContext {
    return {
        userId: session.userId,
        orgId: session.orgId,
        role: session.role,
        permissions: session.permissions,
        sessionId: session.sessionId,
        ...(session.teamId === undefined
            ? {}
            : {
                teamId: session.teamId,
            }),
    };
}

export async function bootstrapSession(
    currentState?: AuthState,
    dependencies: Pick<
        typeof import("./auth.api"),
        "meRequest" | "refreshRequest"
    > = { meRequest, refreshRequest },
): Promise<AuthState> {
    try {
        const refresh = await dependencies.refreshRequest();

        if (!refresh) {
            return { status: "anonymous" };
        }

        const me = await dependencies.meRequest(refresh.data.accessToken);

        return {
            status: "authenticated",
            accessToken: refresh.data.accessToken,
            expiresInSeconds: refresh.data.expiresInSeconds,
            context: getAuthContext(me.data),
            user: me.data.user,
        };
    } catch (error: unknown) {
        return resolveRefreshFailure(error, currentState);
    }
}

export function resolveRefreshFailure(
    error: unknown,
    currentState?: AuthState,
): AuthState {
    if (error instanceof ApiError && error.status === 401) {
        return { status: "anonymous" };
    }

    return currentState?.status === "authenticated"
        ? currentState
        : { status: "unavailable" };
}

function getBootstrapPromise(): Promise<AuthState> {
    bootstrapPromise ??= bootstrapSession();
    return bootstrapPromise;
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
    const [state, setState] = useState<AuthState>({ status: "loading" });

    useEffect(() => {
        let active = true;

        void getBootstrapPromise().then((nextState) => {
            if (active) {
                setState(nextState);
            }
        });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (
            state.status !== "authenticated"
            || state.expiresInSeconds === undefined
        ) {
            return;
        }

        const delayMs = Math.max(
            30_000,
            (state.expiresInSeconds - 60) * 1_000,
        );
        const timeout = window.setTimeout(() => {
            void bootstrapSession(state).then((nextState) => {
                bootstrapPromise = Promise.resolve(nextState);
                setState(nextState);
            });
        }, delayMs);

        return () => window.clearTimeout(timeout);
    }, [state]);

    const login = useCallback(async (input: LoginInput) => {
        const response = await loginRequest(input);
        const me = await meRequest(response.data.accessToken);
        const nextState: AuthState = {
            status: "authenticated",
            accessToken: response.data.accessToken,
            expiresInSeconds: response.data.expiresInSeconds,
            context: getAuthContext(me.data),
            user: me.data.user,
        };

        bootstrapPromise = Promise.resolve(nextState);
        setState(nextState);
    }, []);

    const logout = useCallback(async () => {
        try {
            await logoutRequest();
        } finally {
            const nextState: AuthState = { status: "anonymous" };
            bootstrapPromise = Promise.resolve(nextState);
            setState(nextState);
        }
    }, []);

    const retrySession = useCallback(async () => {
        const nextPromise = bootstrapSession(state);
        bootstrapPromise = nextPromise;
        const nextState = await nextPromise;
        setState(nextState);
    }, [state]);

    const value = useMemo<AuthValue>(
        () => ({ ...state, login, logout, retrySession }),
        [login, logout, retrySession, state],
    );

    return (
        <AuthContextObject.Provider value={value}>
            {children}
        </AuthContextObject.Provider>
    );
}

export function useAuth(): AuthValue {
    const value = useContext(AuthContextObject);

    if (!value) {
        throw new Error("useAuth must be used inside AuthProvider.");
    }

    return value;
}
