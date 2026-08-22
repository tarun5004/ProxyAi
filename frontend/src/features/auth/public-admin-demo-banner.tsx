"use client";

import { ClockCountdown, ShieldCheck } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

interface PublicAdminDemoBannerProps {
    readonly expiresAt: string;
    readonly onExpire: () => void;
}

function secondsRemaining(expiresAt: string): number {
    return Math.max(
        0,
        Math.ceil((Date.parse(expiresAt) - Date.now()) / 1_000),
    );
}

export function formatDemoCountdown(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function PublicAdminDemoBanner({
    expiresAt,
    onExpire,
}: PublicAdminDemoBannerProps) {
    const [remaining, setRemaining] = useState(() =>
        secondsRemaining(expiresAt));
    const expirationReported = useRef(false);

    useEffect(() => {
        const update = () => {
            const nextRemaining = secondsRemaining(expiresAt);
            setRemaining(nextRemaining);

            if (nextRemaining === 0 && !expirationReported.current) {
                expirationReported.current = true;
                onExpire();
            }
        };

        update();
        const interval = window.setInterval(update, 1_000);
        return () => window.clearInterval(interval);
    }, [expiresAt, onExpire]);

    return (
        <aside
            className="sticky top-0 z-50 flex min-h-10 flex-wrap items-center justify-center gap-x-5 gap-y-1 border-b border-brand/20 bg-brand-soft px-4 py-2 text-xs font-medium text-brand-dark"
            aria-live="polite"
        >
            <span className="inline-flex items-center gap-2">
                <ShieldCheck size={16} weight="fill" aria-hidden="true" />
                Demo mode — administrative changes are disabled.
            </span>
            <span className="inline-flex items-center gap-2 tabular-nums">
                <ClockCountdown size={16} aria-hidden="true" />
                Session expires in {formatDemoCountdown(remaining)}
            </span>
        </aside>
    );
}
