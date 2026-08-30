"use client";

import { useState } from "react";

import { problemStatements } from "../content";
import { SectionHeading } from "./section-heading";

export function ProblemSection() {
    const [activeIndex, setActiveIndex] = useState(0);
    const active = problemStatements[activeIndex];

    return (
        <section className="relative overflow-hidden border-y border-line bg-white py-20 sm:py-24" aria-labelledby="problem-heading">
            {/* Ambient background — visible dot-grid + green wash, faded via mask */}
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--color-brand-100) 70%, transparent) 0%, transparent 45%), radial-gradient(circle at 90% 25%, color-mix(in srgb, var(--color-brand-50) 90%, transparent) 0%, transparent 50%)",
                    }}
                />
                <div
                    className="absolute inset-0 opacity-[0.55]"
                    style={{
                        backgroundImage: "radial-gradient(var(--color-line) 1.5px, transparent 1.5px)",
                        backgroundSize: "26px 26px",
                        maskImage: "radial-gradient(ellipse 75% 65% at 50% 15%, black 30%, transparent 90%)",
                        WebkitMaskImage: "radial-gradient(ellipse 75% 65% at 50% 15%, black 30%, transparent 90%)",
                    }}
                />
                <div className="absolute top-[-6rem] right-[-4rem] size-[26rem] rounded-full bg-brand-200/60 blur-[90px] motion-safe:animate-[drift_16s_ease-in-out_infinite]" />
            </div>

            <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="ProxiAI inserts one trusted control boundary between employees and the external model path."
                    eyebrow="WHY A GATEWAY"
                    id="problem-heading"
                    title="Enterprise AI needs more than a direct provider key."
                />

                <div className="mt-12 grid gap-6 lg:grid-cols-[0.5fr_1.5fr]">
                    {/* Selector rail */}
                    <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:flex-col lg:gap-1.5" role="tablist" aria-label="Gateway risk areas">
                        {problemStatements.map((problem, index) => {
                            const isActive = index === activeIndex;
                            return (
                                <button
                                    aria-controls="problem-detail-panel"
                                    aria-selected={isActive}
                                    className={`group relative w-full rounded-xl px-4 py-4 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                                        isActive
                                            ? "bg-brand-500 shadow-panel"
                                            : "bg-surface-muted hover:bg-brand-50"
                                    }`}
                                    id={`problem-tab-${problem.number}`}
                                    key={problem.number}
                                    onClick={() => setActiveIndex(index)}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    role="tab"
                                    type="button"
                                >
                                    <span className={`font-mono text-xs font-bold ${isActive ? "text-white/70" : "text-brand-700"}`}>
                                        {problem.number}
                                    </span>
                                    <p className={`mt-1 text-sm leading-6 font-semibold ${isActive ? "text-white" : "text-ink-800"}`}>
                                        {problem.title}
                                    </p>
                                </button>
                            );
                        })}
                    </div>

                    {/* Detail panel */}
                    <div
                        aria-labelledby={`problem-tab-${active.number}`}
                        className="relative flex min-h-[16rem] flex-col justify-center overflow-hidden rounded-2xl border border-line bg-white p-8 shadow-soft sm:p-12"
                        id="problem-detail-panel"
                        role="tabpanel"
                    >
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-brand-300 to-transparent" aria-hidden="true" />
                        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-10 font-mono text-[11rem] leading-none font-bold text-brand-50 select-none">
                            {active.number}
                        </span>
                        <div key={active.number} className="relative motion-safe:animate-[fadeUp_0.35s_ease-out]">
                            <h3 className="text-2xl font-bold tracking-[-0.03em] text-ink-950 sm:text-3xl">{active.title}</h3>
                            <p className="mt-4 max-w-xl text-base leading-7 text-ink-600">{active.detail}</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
