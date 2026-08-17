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

import {
    loginRequest,
    logoutRequest,
    meRequest,
    refreshRequest,
} from "./auth.api";
import type { AuthContext, LoginInput, LoginUser } from "./auth.types";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
    status: AuthStatus;
    accessToken?: string;
    expiresInSeconds?: number;
    context?: AuthContext;
    user?: LoginUser;
}

interface AuthValue extends AuthState {
    login(input: LoginInput): Promise<void>;
    logout(): Promise<void>;
}

const AuthContextObject = createContext<AuthValue | null>(null);
let bootstrapPromise: Promise<AuthState> | undefined;

async function bootstrapSession(): Promise<AuthState> {
    try {
        const refresh = await refreshRequest();
        const me = await meRequest(refresh.data.accessToken);

        return {
            status: "authenticated",
            accessToken: refresh.data.accessToken,
            expiresInSeconds: refresh.data.expiresInSeconds,
            context: me.data,
        };
    } catch {
        return { status: "anonymous" };
    }
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
            void bootstrapSession().then((nextState) => {
                bootstrapPromise = Promise.resolve(nextState);
                setState(nextState);
            });
        }, delayMs);

        return () => window.clearTimeout(timeout);
    }, [state.expiresInSeconds, state.status]);

    const login = useCallback(async (input: LoginInput) => {
        const response = await loginRequest(input);
        const me = await meRequest(response.data.accessToken);
        const nextState: AuthState = {
            status: "authenticated",
            accessToken: response.data.accessToken,
            expiresInSeconds: response.data.expiresInSeconds,
            context: me.data,
            user: response.data.user,
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

    const value = useMemo<AuthValue>(
        () => ({ ...state, login, logout }),
        [login, logout, state],
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
