import { SectionHeading } from "./section-heading";

const mainFlow = ["User / Client", "Auth + Tenant Context", "PII + Policy", "Provider Abstraction", "Groq"] as const;
const supportingSystems = [
    ["MongoDB", "Tenant records, append-only usage/audit, encrypted or metadata-only history"],
    ["Redis + BullMQ", "Idempotency, rate limits, workers, health, and durable enqueue recovery"],
    ["Operations", "Low-cardinality metrics, safe logs, dashboards, alerts, and runbooks as code"],
] as const;

export function ArchitectureSection() {
    return (
        <section className="py-20 sm:py-28" id="architecture" aria-labelledby="architecture-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="The Express API stays authoritative. Every tenant-owned query uses trusted organisation context, while provider SDK details remain inside adapters."
                    eyebrow="SYSTEM SHAPE"
                    id="architecture-heading"
                    title="A policy-aware gateway with explicit trust boundaries."
                />

                <div className="mt-12 overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
                    <div className="grid gap-3 bg-ink-950 p-6 sm:p-8 lg:grid-cols-[repeat(9,minmax(0,1fr))] lg:items-center">
                        {mainFlow.map((step, index) => (
                            <div className="contents" key={step}>
                                <div className={`rounded-xl border px-4 py-4 text-center text-sm font-semibold ${index === 2 ? "border-brand-500 bg-brand-500 text-white" : "border-white/15 bg-white/7 text-white"}`}>
                                    {step}
                                </div>
                                {index < mainFlow.length - 1 ? (
                                    <span className="text-center text-brand-200 max-lg:rotate-90" aria-hidden="true">→</span>
                                ) : null}
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-px bg-line md:grid-cols-3">
                        {supportingSystems.map(([title, detail]) => (
                            <article className="bg-white p-6 sm:p-7" key={title}>
                                <h3 className="text-base font-bold text-ink-950">{title}</h3>
                                <p className="mt-3 text-sm leading-6 text-ink-600">{detail}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
