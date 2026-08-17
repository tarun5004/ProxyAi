"use client";

import { CheckCircle, ShieldCheck, X } from "@phosphor-icons/react";

import type {
    DoneEvent,
    FallbackEvent,
    PolicyEvent,
    RoutingEvent,
} from "@/features/chat/chat.types";

interface PolicyInspectorProps {
    policy?: PolicyEvent;
    routing?: RoutingEvent;
    fallback?: FallbackEvent;
    completion?: DoneEvent;
    open: boolean;
    onClose(): void;
}

export function PolicyInspector(props: PolicyInspectorProps) {
    const action = props.policy?.action ?? "PENDING";
    const score = props.policy?.riskScore ?? 0;
    const categories = props.policy?.categories ?? [];

    return (
        <aside className={`flex min-w-0 flex-col gap-3.5 overflow-y-auto border-l border-border-default bg-surface px-[18px] pt-7 pb-[22px] max-[1280px]:fixed max-[1280px]:inset-y-0 max-[1280px]:right-0 max-[1280px]:z-45 max-[1280px]:w-[min(90vw,360px)] max-[1280px]:shadow-[-18px_0_48px_rgb(8_22_14_/_12%)] max-[1280px]:transition-transform max-[1280px]:duration-200 ${props.open ? "max-[1280px]:translate-x-0" : "max-[1280px]:translate-x-[105%]"}`}>
            <header className="flex min-h-[47px] items-center justify-between border-b border-border-default">
                <div className="grid gap-[3px]">
                    <strong className="text-sm text-brand-dark">Policy</strong>
                    <span className="text-[11px] text-text-faint">Live request safety</span>
                </div>
                <button
                    className="hidden size-9 place-items-center rounded-[9px] bg-surface-soft max-[1280px]:grid"
                    onClick={props.onClose}
                    aria-label="Close policy inspector"
                >
                    <X size={20} />
                </button>
            </header>

            <section className="grid gap-3.5 rounded-[13px] border border-border-default bg-surface p-4 shadow-panel">
                <span className="text-xs font-semibold text-text-primary">Policy Summary</span>
                <div className="flex items-center gap-3 text-brand">
                    <ShieldCheck size={31} weight="fill" />
                    <div className="grid gap-1">
                        <strong className="text-[15px]">{formatAction(action)}</strong>
                        <span className="text-[11px] leading-6 text-text-soft">
                            {decisionDescription(action)}
                        </span>
                    </div>
                </div>
            </section>

            <section className="grid gap-3.5 rounded-[13px] border border-border-default bg-surface p-4 shadow-panel">
                <span className="text-xs font-semibold text-text-primary">Risk Score</span>
                <div className="flex items-baseline justify-between">
                    <strong className="text-[28px] tracking-[-0.05em]">
                        {score}<small className="text-[11px] tracking-normal text-text-faint">/100</small>
                    </strong>
                    <span className="text-xs font-semibold text-brand-dark">
                        {score < 20 ? "Low risk" : score < 40 ? "Review" : "High risk"}
                    </span>
                </div>
                <progress
                    className="h-[7px] w-full overflow-hidden rounded-full border-0 bg-[#edf0ee] [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-[#edf0ee] [&::-webkit-progress-value]:bg-brand"
                    value={score}
                    max={100}
                    aria-label={`Risk score ${score} of 100`}
                />
            </section>

            <section className="grid gap-3.5 rounded-[13px] border border-border-default bg-surface p-4 shadow-panel">
                <span className="text-xs font-semibold text-text-primary">Detected Categories</span>
                {categories.length === 0 ? (
                    <p className="m-0 text-[11px] leading-6 text-text-soft">
                        No sensitive categories detected.
                    </p>
                ) : (
                    <ul className="m-0 grid list-none gap-[9px] p-0">
                        {categories.map((category) => (
                            <li className="flex items-center gap-2 text-[11px] text-[#333a35]" key={category}>
                                <CheckCircle className="text-brand" size={16} weight="fill" />
                                {category.replaceAll("_", " ")}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="grid gap-3.5 rounded-[13px] border border-border-default bg-surface p-4 shadow-panel">
                <span className="text-xs font-semibold text-text-primary">Processing Details</span>
                <dl className="m-0 grid gap-[11px]">
                    <Detail label="Masking" value={props.policy?.masked ? "Applied" : "Not applied"} />
                    <Detail label="Provider" value={props.routing?.provider ?? "Pending"} />
                    <Detail label="Model" value={props.completion?.model ?? "openai/gpt-oss-20b"} />
                    <Detail label="Routing" value={props.routing?.routingReason ?? "Manual"} />
                    <Detail label="Fallback" value={formatFallback(props.fallback)} />
                    <Detail label="Latency" value={props.completion ? `${props.completion.latencyMs} ms` : "—"} />
                    <Detail label="Tokens" value={String(props.completion?.usage?.totalTokens ?? "—")} />
                </dl>
            </section>
        </aside>
    );
}

function formatFallback(fallback?: FallbackEvent): string {
    if (!fallback) {
        return "None";
    }

    if (fallback.fromProvider && fallback.toProvider) {
        return `${fallback.fromProvider} → ${fallback.toProvider}`;
    }

    return fallback.reason ?? "Applied";
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
    return (
        <div className="flex justify-between gap-3 text-[11px]">
            <dt className="text-text-soft">{label}</dt>
            <dd className="m-0 max-w-[60%] wrap-anywhere text-right">{value}</dd>
        </div>
    );
}

function formatAction(action: PolicyEvent["action"] | "PENDING") {
    return action === "ALLOW_WITH_MASK" ? "ALLOW WITH MASK" : action;
}

function decisionDescription(action: PolicyEvent["action"] | "PENDING") {
    if (action === "BLOCK") {
        return "The request was stopped before provider execution.";
    }

    if (action === "ALLOW_WITH_MASK") {
        return "Sensitive spans were masked before routing.";
    }

    if (action === "ALLOW") {
        return "No blocking issues found.";
    }

    return "Send a message to evaluate policy.";
}
