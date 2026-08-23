"use client";

import { useState } from "react";

import { lifecycleSteps, policyActions } from "../content";
import { SectionHeading } from "./section-heading";

const actionTone = {
    amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-950", dot: "bg-amber-500" },
    green: { border: "border-brand-200", bg: "bg-brand-50", text: "text-brand-700", dot: "bg-brand-500" },
    red: { border: "border-red-200", bg: "bg-red-50", text: "text-red-900", dot: "bg-red-500" },
} as const;

const POLICY_STEP_INDEX = 6; // "ALLOW / MASK / BLOCK policy" — step 07

export function LifecycleSection() {
    const [hoveredPolicy, setHoveredPolicy] = useState<number | null>(null);
    const isTimelineLit = hoveredPolicy !== null;

    return (
        <section className="relative overflow-hidden border-y border-line bg-surface-muted py-20 sm:py-28" aria-labelledby="lifecycle-heading">
            {/* Fixed: visible dot-grid using ink tone, not near-invisible line color */}
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <div
                    className="absolute inset-0 opacity-[0.06]"
                    style={{
                        backgroundImage: "radial-gradient(var(--color-ink-950) 1.5px, transparent 1.5px)",
                        backgroundSize: "24px 24px",
                    }}
                />
                <div className="absolute top-1/2 left-[-8rem] size-[26rem] -translate-y-1/2 rounded-full bg-brand-200/50 blur-[100px]" />
            </div>

            <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
                <div>
                    <SectionHeading
                        description="Security checks happen before provider execution. Persistence and background work happen only through approved boundaries after the outcome is known."
                        eyebrow="REAL REQUEST LIFECYCLE"
                        id="lifecycle-heading"
                        title="Every request follows a deterministic order."
                    />
                    <div className="mt-8 grid gap-3">
                        {policyActions.map((policy, index) => {
                            const tone = actionTone[policy.tone];
                            const isHovered = hoveredPolicy === index;
                            return (
                                <article
                                    className={`cursor-default rounded-xl border p-4 transition-all duration-200 ${tone.border} ${tone.bg} ${
                                        isHovered ? "scale-[1.03] shadow-panel ring-2 ring-offset-2 ring-offset-surface-muted" : ""
                                    } ${isHovered && policy.tone === "green" ? "ring-brand-400" : ""} ${isHovered && policy.tone === "amber" ? "ring-amber-400" : ""} ${isHovered && policy.tone === "red" ? "ring-red-400" : ""}`}
                                    key={policy.action}
                                    onMouseEnter={() => setHoveredPolicy(index)}
                                    onMouseLeave={() => setHoveredPolicy(null)}
                                >
                                    <h3 className={`flex items-center gap-2 font-mono text-xs font-bold ${tone.text}`}>
                                        <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                                        {policy.action}
                                    </h3>
                                    <p className={`mt-2 text-sm leading-6 ${tone.text}`}>{policy.detail}</p>
                                </article>
                            );
                        })}
                    </div>
                    <p className="mt-3 text-xs text-ink-600">Hover a policy outcome to trace it through the pipeline →</p>
                </div>

                {/* Denser 2-col grid restored, connecting rail added on top, stronger highlight */}
                <ol className="grid gap-0 rounded-2xl border border-line bg-white p-5 shadow-panel sm:grid-cols-2 sm:p-7">
                    {lifecycleSteps.map((step, index) => {
                        const isPolicyStep = index === POLICY_STEP_INDEX;
                        const isHighlighted = isPolicyStep && isTimelineLit;
                        return (
                            <li
                                className={`relative flex min-h-16 items-center gap-4 border-b border-line py-4 transition-colors duration-200 last:border-b-0 sm:odd:border-r sm:odd:pr-5 sm:even:pl-5 sm:[&:nth-last-child(-n+2)]:border-b-0 ${
                                    isHighlighted ? "bg-brand-50" : ""
                                }`}
                                key={step}
                            >
                                <span
                                    className={`grid size-8 shrink-0 place-items-center rounded-full font-mono text-xs font-bold transition-all duration-200 ${
                                        isHighlighted ? "scale-110 bg-brand-500 text-white shadow-[0_0_0_4px_rgba(10,155,67,0.15)]" : "bg-ink-950 text-white"
                                    }`}
                                >
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className={`text-sm font-semibold transition-colors duration-200 ${isHighlighted ? "text-brand-700" : "text-ink-800"}`}>
                                    {step}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </section>
    );
}