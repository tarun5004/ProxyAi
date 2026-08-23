"use client";

import { SectionHeading } from "./section-heading";

const reliabilityAreas = [
    {
        title: "Provider boundary",
        detail: "Canonical adapters normalize completion, streaming, health, usage, and failures. Bounded retry and circuit state are reusable across candidates.",
        note: "Groq is the only enabled production provider. The ordered fallback abstraction is tested, but the current production chain has one candidate.",
    },
    {
        title: "Async accounting",
        detail: "Append-only RequestLog records known usage. Idempotent BullMQ workers reconcile billing and tenant-scoped analytics without mutating the source record.",
        note: "Unknown provider usage remains unknown; no synthetic token or cost value is created.",
    },
    {
        title: "Operational recovery",
        detail: "Worker heartbeats, provider-health state, failed-job retention, analytics/anomaly processing, and durable enqueue recovery make background failure visible and bounded.",
        note: "Prompt, response, PII, credentials, and raw provider errors stay out of job payloads and logs.",
    },
] as const;

export function ReliabilitySection() {
    return (
        <section className="relative overflow-hidden py-20 sm:py-28" aria-labelledby="reliability-heading">
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <div
                    className="absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage: "radial-gradient(var(--color-ink-950) 1.5px, transparent 1.5px)",
                        backgroundSize: "24px 24px",
                    }}
                />
                <div className="absolute top-[-6rem] right-1/3 size-[24rem] rounded-full bg-brand-100/60 blur-[100px]" />
            </div>

            <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="Provider execution and background accounting use separate, bounded failure paths so chat delivery does not invent billing truth."
                    eyebrow="RELIABILITY + ASYNC"
                    id="reliability-heading"
                    title="Failures are normalized, retried carefully, and recorded safely."
                />

                {/* Flip-reveal cards: capability on front, honest caveat on hover/focus */}
                <div className="mt-12 grid gap-5 lg:grid-cols-3">
                    {reliabilityAreas.map((area) => (
                        <div className="group [perspective:1200px]" key={area.title} tabIndex={0}>
                            <div className="relative h-72 w-full transition-transform duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)] group-focus-visible:[transform:rotateY(180deg)]">
                                {/* Front */}
                                <article className="absolute inset-0 flex flex-col rounded-2xl border border-line bg-white p-6 shadow-panel [backface-visibility:hidden] sm:p-7">
                                    <h3 className="text-xl font-bold text-ink-950">{area.title}</h3>
                                    <p className="mt-4 text-sm leading-7 text-ink-600">{area.detail}</p>
                                    <span className="mt-auto flex items-center gap-1.5 pt-4 text-xs font-semibold text-brand-700" aria-hidden="true">
                                        Hover for the honest limit
                                        <span className="transition-transform group-hover:translate-x-1">→</span>
                                    </span>
                                </article>

                                {/* Back */}
                                <article className="absolute inset-0 flex flex-col rounded-2xl border border-brand-200 bg-brand-50 p-6 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-7">
                                    <p className="font-mono text-xs font-bold tracking-[0.08em] text-brand-700">SCOPE</p>
                                    <p className="mt-4 text-sm leading-7 text-ink-800">{area.note}</p>
                                </article>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-5 rounded-2xl border border-line bg-surface-muted p-6 sm:p-8">
                    <div className="grid gap-5 md:grid-cols-[0.8fr_1.2fr] md:items-center">
                        <div>
                            <p className="text-xs font-bold tracking-[0.12em] text-brand-700">OBSERVABILITY BOUNDARY</p>
                            <h3 className="mt-3 text-2xl font-bold tracking-[-0.035em] text-ink-950">Instrumentation exists without pretending hosted delivery is always running.</h3>
                        </div>
                        <p className="text-sm leading-7 text-ink-600">Safe structured logs, a protected Prometheus-compatible metrics endpoint, low-cardinality labels, dashboard and alert definitions, and runbooks are implemented. Continuous hosted collection and alert delivery can remain intentionally deferred while the demo environment is deep-stopped.</p>
                    </div>
                </div>
            </div>
        </section>
    );
}