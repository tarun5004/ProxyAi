import releaseEvidence from "@/content/release-evidence.json";

import { SectionHeading } from "./section-heading";

const evidenceItems = [
    ["Backend tests", releaseEvidence.backendTests],
    ["Frontend tests", releaseEvidence.frontendTests],
    ["Isolated integration", releaseEvidence.integrationTests],
    ["Backend line coverage", releaseEvidence.backendLineCoverage],
    ["Frontend line coverage", releaseEvidence.frontendLineCoverage],
] as const;

export function ReleaseEvidence() {
    return (
        <section className="relative overflow-hidden border-y border-line bg-surface-muted py-20 sm:py-28" id="evidence" aria-labelledby="evidence-heading">
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <div
                    className="absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage: "radial-gradient(var(--color-ink-950) 1.5px, transparent 1.5px)",
                        backgroundSize: "24px 24px",
                    }}
                />
                <div className="absolute top-1/2 right-[-6rem] size-[26rem] -translate-y-1/2 rounded-full bg-brand-100/70 blur-[100px]" />
            </div>

            <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
                <div>
                    <SectionHeading
                        description="This is dated internal release evidence from the repository audit baseline. It is not an external certification and does not silently track later commits."
                        eyebrow="VERIFIED RELEASE EVIDENCE"
                        id="evidence-heading"
                        title="Engineering claims tied to a named evidence baseline."
                    />

                    {/* Receipt-style metadata block — monospace, ties to "audit trail" language used elsewhere */}
                    <dl className="mt-7 grid gap-2.5 rounded-xl border border-line bg-white p-5 font-mono text-xs shadow-panel sm:p-6">
                        <div className="flex items-center justify-between gap-3 border-b border-dashed border-line pb-2.5">
                            <dt className="text-ink-600">evidence</dt>
                            <dd className="font-semibold text-ink-950">{releaseEvidence.label}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-b border-dashed border-line pb-2.5">
                            <dt className="text-ink-600">verified_at</dt>
                            <dd className="font-semibold text-ink-950">{releaseEvidence.verifiedAt}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <dt className="text-ink-600">source_commit</dt>
                            <dd className="rounded bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">{releaseEvidence.sourceCommit}</dd>
                        </div>
                    </dl>
                </div>

                {/* Stat grid with a rotated "verified" stamp anchored to the panel */}
                <div className="relative">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-5 -right-3 z-10 grid size-20 rotate-[10deg] place-items-center rounded-full border-2 border-dashed border-brand-500/50 bg-white shadow-panel motion-safe:animate-[stampIn_0.5s_ease-out]"
                    >
                        <span className="text-center font-mono text-[9px] leading-tight font-bold tracking-[0.05em] text-brand-700">
                            VERIFIED
                            <br />✓
                        </span>
                    </div>

                    <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
                        {evidenceItems.map(([label, value], index) => (
                            <article
                                className={`bg-white p-6 transition-colors hover:bg-brand-50/40 ${index === evidenceItems.length - 1 ? "sm:col-span-2" : ""}`}
                                key={label}
                            >
                                <p className="font-mono text-2xl font-bold tracking-[-0.02em] text-ink-950">{value}</p>
                                <p className="mt-2 text-sm text-ink-600">{label}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}