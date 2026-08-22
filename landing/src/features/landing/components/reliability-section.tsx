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
        <section className="py-20 sm:py-28" aria-labelledby="reliability-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="Provider execution and background accounting use separate, bounded failure paths so chat delivery does not invent billing truth."
                    eyebrow="RELIABILITY + ASYNC"
                    id="reliability-heading"
                    title="Failures are normalized, retried carefully, and recorded safely."
                />
                <div className="mt-12 grid gap-5 lg:grid-cols-3">
                    {reliabilityAreas.map((area) => (
                        <article className="flex h-full flex-col rounded-2xl border border-line bg-white p-6 shadow-panel sm:p-7" key={area.title}>
                            <h3 className="text-xl font-bold text-ink-950">{area.title}</h3>
                            <p className="mt-4 text-sm leading-7 text-ink-600">{area.detail}</p>
                            <p className="mt-6 border-t border-line pt-5 text-xs leading-6 text-ink-600">{area.note}</p>
                        </article>
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
