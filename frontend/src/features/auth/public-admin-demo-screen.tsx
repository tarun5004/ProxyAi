"use client";

import { ArrowLeft, ArrowRight, CircleNotch, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";

import { useAuth } from "./auth-provider";

export const DEMO_HEALTH_POLL_INTERVAL_MS = 4_000;
export const DEMO_WAKE_TIMEOUT_MS = 120_000;

type WakePhase = "idle" | "waking" | "ready" | "error";

interface WaitForDemoBackendInput {
    readonly signal: AbortSignal;
    readonly checkHealth?: (signal: AbortSignal) => Promise<boolean>;
    readonly sleep?: (durationMs: number, signal: AbortSignal) => Promise<void>;
    readonly now?: () => number;
}

export function createDemoHealthUrl(
    apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL,
): string {
    if (apiBaseUrl === undefined || apiBaseUrl.trim() === "") {
        return "/health/ready";
    }

    return new URL("/health/ready", apiBaseUrl).toString();
}

async function checkDemoHealth(signal: AbortSignal): Promise<boolean> {
    try {
        const response = await fetch(createDemoHealthUrl(), {
            cache: "no-store",
            signal,
        });
        return response.ok;
    } catch {
        return false;
    }
}

function sleepWithSignal(
    durationMs: number,
    signal: AbortSignal,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(resolve, durationMs);
        signal.addEventListener("abort", () => {
            window.clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}

export async function waitForDemoBackend({
    signal,
    checkHealth = checkDemoHealth,
    sleep = sleepWithSignal,
    now = Date.now,
}: WaitForDemoBackendInput): Promise<boolean> {
    const deadline = now() + DEMO_WAKE_TIMEOUT_MS;

    while (!signal.aborted) {
        if (await checkHealth(signal)) {
            return true;
        }

        if (now() >= deadline) {
            return false;
        }

        await sleep(DEMO_HEALTH_POLL_INTERVAL_MS, signal);
    }

    return false;
}

export function PublicAdminDemoScreen({
    expired = false,
}: Readonly<{ expired?: boolean }>) {
    const auth = useAuth();
    const router = useRouter();
    const abortController = useRef<AbortController | null>(null);
    const [phase, setPhase] = useState<WakePhase>("idle");

    useEffect(() => () => abortController.current?.abort(), []);

    async function startDemo() {
        abortController.current?.abort();
        const controller = new AbortController();
        abortController.current = controller;
        setPhase("waking");

        try {
            const ready = await waitForDemoBackend({
                signal: controller.signal,
            });

            if (!ready) {
                setPhase("error");
                return;
            }

            setPhase("ready");
            await auth.startPublicAdminDemo();
            router.replace("/admin");
        } catch {
            if (!controller.signal.aborted) {
                setPhase("error");
            }
        }
    }

    const busy = phase === "waking" || phase === "ready";

    return (
        <main className="grid min-h-dvh place-items-center bg-app-bg px-5 py-8">
            <section className="grid w-full max-w-lg justify-items-center gap-7 rounded-2xl border border-border-default bg-surface px-8 py-10 text-center shadow-soft sm:px-12">
                <Link
                    className="rounded focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand/25"
                    href="/"
                    aria-label="Back to ProxiAI home"
                >
                    <BrandLogo compact />
                </Link>

                <div className="grid justify-items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
                        <ShieldCheck size={26} weight="fill" aria-hidden="true" />
                    </span>
                    <h1 className="text-3xl font-bold tracking-[-0.04em]">
                        {expired ? "Your demo session has expired." : "Public Admin Demo"}
                    </h1>
                    <p className="max-w-md text-sm leading-6 text-text-soft">
                        Explore current read-only admin data and the governed chat workflow. No administrator password is shared or stored in this page.
                    </p>
                </div>

                <div className="min-h-13 text-sm text-text-soft" aria-live="polite">
                    {phase === "waking" ? (
                        <div className="grid justify-items-center gap-2">
                            <CircleNotch className="animate-spin text-brand" size={22} aria-hidden="true" />
                            <strong className="text-text-primary">Waking demo service…</strong>
                            <span>This may take up to 1–2 minutes after inactivity.</span>
                        </div>
                    ) : null}
                    {phase === "ready" ? (
                        <div className="grid justify-items-center gap-2 text-brand-dark">
                            <ShieldCheck size={22} weight="fill" aria-hidden="true" />
                            <strong>Demo service ready</strong>
                            <span>Starting your secure six-minute session…</span>
                        </div>
                    ) : null}
                    {phase === "error" ? (
                        <p role="alert" className="text-danger">
                            The demo service is not ready yet. Please try again shortly.
                        </p>
                    ) : null}
                    {phase === "idle" ? (
                        <p>Demo backend may take 1–2 minutes to wake after inactivity.</p>
                    ) : null}
                </div>

                <Button
                    className="inline-flex min-h-11.5 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-brand px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    loading={busy}
                    onClick={() => void startDemo()}
                >
                    {expired ? "Start another demo" : "Open Admin Demo"}
                    <ArrowRight size={16} weight="bold" aria-hidden="true" />
                </Button>

                <Link className="inline-flex items-center gap-2 text-sm font-medium text-text-soft hover:text-text-primary" href="/login">
                    <ArrowLeft size={16} aria-hidden="true" />
                    Private account login
                </Link>
            </section>
        </main>
    );
}
