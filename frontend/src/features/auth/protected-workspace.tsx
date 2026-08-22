"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "./auth-provider";
import { PublicAdminDemoBanner } from "./public-admin-demo-banner";

export function ProtectedWorkspace({ children }: Readonly<{ children: ReactNode }>) {
    const auth = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (auth.status === "anonymous") {
            router.replace(
                auth.demoExpired
                    ? "/demo-admin?expired=1"
                    : "/login",
            );
        }
    }, [auth.demoExpired, auth.status, router]);

    if (auth.status !== "authenticated") {
        return (
            <main
                className="grid min-h-dvh place-items-center text-sm text-text-soft"
                aria-live="polite"
            >
                {auth.status === "unavailable" ? (
                    <div className="grid justify-items-center gap-3 text-center">
                        <p>Session service is temporarily unavailable.</p>
                        <button
                            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white"
                            type="button"
                            onClick={() => void auth.retrySession()}
                        >
                            Try again
                        </button>
                    </div>
                ) : (
                    "Preparing your secure workspace…"
                )}
            </main>
        );
    }

    return (
        <>
            {auth.context?.sessionMode === "PUBLIC_ADMIN_DEMO"
            && auth.demoExpiresAt ? (
                <PublicAdminDemoBanner
                    expiresAt={auth.demoExpiresAt}
                    onExpire={auth.expirePublicDemo}
                />
                ) : null}
            {children}
        </>
    );
}
