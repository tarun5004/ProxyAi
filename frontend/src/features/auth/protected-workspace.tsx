"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "./auth-provider";

export function ProtectedWorkspace({ children }: Readonly<{ children: ReactNode }>) {
    const auth = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (auth.status === "anonymous") {
            router.replace("/login");
        }
    }, [auth.status, router]);

    if (auth.status !== "authenticated") {
        return (
            <main
                className="grid min-h-dvh place-items-center text-sm text-text-soft"
                aria-live="polite"
            >
                Preparing your secure workspace…
            </main>
        );
    }

    return children;
}
