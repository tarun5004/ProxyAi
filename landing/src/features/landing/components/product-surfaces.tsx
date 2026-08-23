"use client";

import { useState } from "react";

import { SectionHeading } from "./section-heading";

const surfaces = [
    {
        title: "Chat workspace",
        shortLabel: "Chat",
        detail: "Conversation navigation, policy-aware streaming, safe Markdown, and explicit retention context.",
        mock: "chat" as const,
    },
    {
        title: "Policy inspector",
        shortLabel: "Policy",
        detail: "Decision, risk score, detected category counts, masking state, and authoritative provider routing.",
        mock: "policy" as const,
    },
    {
        title: "Admin operations",
        shortLabel: "Admin",
        detail: "Tenant users, teams, policy, budget, retention, sessions, alerts, analytics, and append-only audit export.",
        mock: "admin" as const,
    },
];

function ChatMock() {
    return (
        <div className="grid min-h-80 grid-cols-[5.5rem_1fr] bg-white sm:grid-cols-[8rem_1fr_7.5rem]">
            <div className="border-r border-line bg-surface-muted p-3">
                <div className="mb-4 h-5 w-16 rounded bg-brand-500" />
                <div className="grid gap-2">
                    <div className="h-8 rounded-md border border-brand-200 bg-brand-50" />
                    <div className="h-8 rounded-md bg-white" />
                    <div className="h-8 rounded-md bg-white" />
                </div>
            </div>

            <div className="flex min-w-0 flex-col p-4 sm:p-5">
                <div className="mb-5 flex items-center justify-between border-b border-line pb-3">
                    <div>
                        <p className="text-[10px] font-bold text-ink-950">Incident review</p>
                        <p className="mt-1 text-[9px] text-ink-600">Policy-aware conversation</p>
                    </div>
                    <span className="size-2 rounded-full bg-brand-500" aria-label="Provider available" />
                </div>

                <div className="grid gap-3">
                    <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-ink-950 px-3 py-2.5 text-[10px] leading-4 text-white">
                        Summarize last quarter&apos;s incidents.
                    </div>
                    <div className="max-w-[92%] rounded-xl rounded-tl-sm border border-line bg-surface-muted px-3 py-2.5 text-[10px] leading-4 text-ink-800">
                        <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[8px] font-bold text-amber-800">MASKED</span>
                        Incidents declined after the updated policy rollout.
                    </div>
                    <div className="h-2 w-24 animate-pulse rounded-full bg-line" />
                </div>

                <div className="mt-auto rounded-lg border border-line bg-white px-3 py-2 text-[9px] text-ink-600 shadow-panel">Ask a governed question…</div>
            </div>

            <div className="hidden border-l border-line bg-surface-muted p-3 sm:block">
                <p className="text-[9px] font-bold text-ink-950">POLICY</p>
                <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-2">
                    <p className="text-[8px] font-bold text-brand-700">ALLOW WITH MASK</p>
                    <p className="mt-1 text-[8px] text-ink-600">Risk 34/100</p>
                </div>
                <div className="mt-3 grid gap-2">
                    <div className="h-7 rounded-md bg-white" />
                    <div className="h-7 rounded-md bg-white" />
                </div>
            </div>
        </div>
    );
}

function PolicyMock() {
    return (
        <div className="grid min-h-80 gap-4 bg-surface-muted p-4 sm:grid-cols-[0.8fr_1.2fr] sm:p-6">
            <div className="flex flex-col justify-between rounded-2xl border border-brand-200 bg-brand-50 p-5">
                <div>
                    <p className="font-mono text-[9px] font-bold tracking-wider text-brand-700">POLICY DECISION</p>
                    <p className="mt-3 text-lg font-bold text-ink-950">ALLOW_WITH_MASK</p>
                    <p className="mt-2 text-[10px] leading-4 text-ink-600">Sensitive spans are replaced before approved provider egress.</p>
                </div>
                <div className="mt-5 flex items-end gap-2">
                    <strong className="text-4xl tracking-tight text-ink-950">34</strong>
                    <span className="pb-1 text-[10px] text-ink-600">/ 100 risk</span>
                </div>
            </div>

            <div className="grid content-start gap-3">
                {[
                    ["Detected category", "CONTACT_INFO ×2"],
                    ["Masking", "Applied before routing"],
                    ["Provider route", "Approved model only"],
                    ["Audit metadata", "Safe fields recorded"],
                ].map(([label, value]) => (
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-white px-4 py-3" key={label}>
                        <span className="text-[9px] font-semibold text-ink-600">{label}</span>
                        <span className="text-right font-mono text-[9px] font-bold text-ink-950">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AdminMock() {
    return (
        <div className="min-h-80 bg-surface-muted p-4 sm:p-6">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                    ["Users", "142"],
                    ["Open alerts", "3"],
                    ["Audit exports", "28"],
                ].map(([label, value]) => (
                    <div className="rounded-xl border border-line bg-white p-3 sm:p-4" key={label}>
                        <p className="font-mono text-xl font-bold text-ink-950 sm:text-2xl">{value}</p>
                        <p className="mt-1 text-[8px] text-ink-600 sm:text-[9px]">{label}</p>
                    </div>
                ))}
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <div>
                        <p className="text-[10px] font-bold text-ink-950">Recent administrative activity</p>
                        <p className="mt-1 text-[8px] text-ink-600">Tenant-scoped, append-only evidence</p>
                    </div>
                    <span className="rounded-full bg-brand-50 px-2 py-1 font-mono text-[8px] font-bold text-brand-700">LIVE</span>
                </div>
                <div className="divide-y divide-line">
                    {["Role permissions synchronized", "Retention policy reviewed", "Audit export completed"].map((event) => (
                        <div className="flex items-center gap-3 px-4 py-2.5" key={event}>
                            <span className="size-1.5 shrink-0 rounded-full bg-brand-500" />
                            <span className="text-[9px] text-ink-800">{event}</span>
                            <span className="ml-auto font-mono text-[8px] text-ink-600">verified</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

const mockRenderers = { chat: ChatMock, policy: PolicyMock, admin: AdminMock };

export function ProductSurfaces() {
    const [activeIndex, setActiveIndex] = useState(0);
    const active = surfaces[activeIndex];
    const MockComponent = mockRenderers[active.mock];

    return (
        <section className="py-20 sm:py-28" aria-labelledby="surfaces-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="The product UI exposes the same backend truth rather than recreating policy, billing, or provider rules in the browser."
                    eyebrow="PRODUCT SURFACES"
                    id="surfaces-heading"
                    title="Chat for employees. Evidence and controls for administrators."
                />

                <div className="mt-12 overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
                    <div className="flex items-center gap-3 border-b border-line bg-surface-muted px-4 py-3 sm:px-5">
                        <div className="flex items-center gap-1.5" aria-hidden="true">
                            <span className="size-2.5 rounded-full bg-red-300" />
                            <span className="size-2.5 rounded-full bg-amber-300" />
                            <span className="size-2.5 rounded-full bg-brand-200" />
                        </div>
                        <div className="mx-auto flex min-w-0 max-w-md flex-1 items-center justify-center rounded-md border border-line bg-white px-3 py-1.5">
                            <span className="truncate font-mono text-[9px] text-ink-600">app.proxiai.me / workspace</span>
                        </div>
                        <span className="hidden font-mono text-[8px] font-bold text-brand-700 sm:block">SECURE</span>
                    </div>

                    <div className="overflow-x-auto border-b border-line bg-white" role="tablist" aria-label="Product surfaces">
                        <div className="flex min-w-max px-3 sm:px-5">
                            {surfaces.map((surface, index) => {
                                const isActive = index === activeIndex;
                                return (
                                    <button
                                        aria-controls="surface-panel"
                                        aria-label={surface.title}
                                        aria-selected={isActive}
                                        className={`relative min-h-12 px-4 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:px-5 ${
                                            isActive ? "text-ink-950" : "text-ink-600 hover:text-ink-950"
                                        }`}
                                        id={`surface-tab-${index}`}
                                        key={surface.title}
                                        onClick={() => setActiveIndex(index)}
                                        role="tab"
                                        type="button"
                                    >
                                        <span className="sm:hidden">{surface.shortLabel}</span>
                                        <span className="hidden sm:inline">{surface.title}</span>
                                        {isActive ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-500" /> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-[0.72fr_1.35fr]" id="surface-panel" role="tabpanel" aria-labelledby={`surface-tab-${activeIndex}`}>
                        <div className="flex flex-col justify-between border-b border-line p-6 sm:p-8 lg:border-r lg:border-b-0 lg:p-10">
                            <div>
                                <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-brand-700">SURFACE 0{activeIndex + 1}</p>
                                <h3 className="mt-4 text-2xl font-bold tracking-tight text-ink-950">{active.title}</h3>
                                <p className="mt-4 text-sm leading-7 text-ink-600">{active.detail}</p>
                            </div>
                            <div className="mt-8 flex items-center gap-2 text-[10px] font-semibold text-ink-600">
                                <span className="relative flex size-2">
                                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-30" />
                                    <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
                                </span>
                                Interactive product preview
                            </div>
                        </div>

                        <div className="min-w-0" aria-live="polite">
                            <MockComponent />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
