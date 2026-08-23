"use client";

import { limitations } from "../content";
import { SectionHeading } from "./section-heading";

export function LimitationsSection() {
    return (
        <section className="relative overflow-hidden border-y border-line bg-surface-muted py-20 sm:py-28" id="limitations" aria-labelledby="limitations-heading">
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <div
                    className="absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage: "radial-gradient(var(--color-ink-950) 1.5px, transparent 1.5px)",
                        backgroundSize: "24px 24px",
                    }}
                />
            </div>

            <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="A trustworthy demo states what is deferred and what cannot be recovered, rather than filling the gaps with synthetic evidence."
                    eyebrow="HONEST LIMITATIONS"
                    id="limitations-heading"
                    title="What the current release does not claim."
                />

                <ul className="mt-12 grid gap-4 md:grid-cols-2">
                    {limitations.map((limitation, index) => (
                        <li
                            className="group relative overflow-hidden rounded-xl border border-line bg-white p-5 text-sm leading-7 text-ink-600 transition-colors hover:border-amber-200"
                            key={limitation}
                        >
                            {/* Stamp — mirrors the "VERIFIED" stamp in release-evidence, inverted here */}
                            <span
                                aria-hidden="true"
                                className="pointer-events-none absolute -top-2 -right-2 grid size-16 rotate-[10deg] place-items-center rounded-full border-2 border-dashed border-amber-300/0 bg-white opacity-0 shadow-panel transition-all duration-300 group-hover:-top-3 group-hover:-right-3 group-hover:border-amber-300 group-hover:opacity-100"
                            >
                                <span className="text-center font-mono text-[8px] leading-tight font-bold tracking-[0.04em] text-amber-700">
                                    NOT
                                    <br />CLAIMED
                                </span>
                            </span>

                            <div className="flex gap-4 pr-8">
                                <span className="mt-0.5 shrink-0 font-mono text-[11px] font-bold text-ink-600/70">
                                    LIMIT_{String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="text-ink-800">{limitation}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}