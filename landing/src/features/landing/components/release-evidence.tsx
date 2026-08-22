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
        <section className="border-y border-line bg-surface-muted py-20 sm:py-28" id="evidence" aria-labelledby="evidence-heading">
            <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
                <div>
                    <SectionHeading
                        description="This is dated internal release evidence from the repository audit baseline. It is not an external certification and does not silently track later commits."
                        eyebrow="VERIFIED RELEASE EVIDENCE"
                        id="evidence-heading"
                        title="Engineering claims tied to a named evidence baseline."
                    />
                    <dl className="mt-7 grid gap-3 text-sm text-ink-600">
                        <div className="flex gap-3"><dt className="font-semibold text-ink-950">Evidence:</dt><dd>{releaseEvidence.label}</dd></div>
                        <div className="flex gap-3"><dt className="font-semibold text-ink-950">Date:</dt><dd>{releaseEvidence.verifiedAt}</dd></div>
                        <div className="flex gap-3"><dt className="font-semibold text-ink-950">Source commit:</dt><dd><code>{releaseEvidence.sourceCommit}</code></dd></div>
                    </dl>
                </div>
                <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
                    {evidenceItems.map(([label, value], index) => (
                        <article className={`bg-white p-6 ${index === evidenceItems.length - 1 ? "sm:col-span-2" : ""}`} key={label}>
                            <p className="text-2xl font-bold tracking-[-0.035em] text-ink-950">{value}</p>
                            <p className="mt-2 text-sm text-ink-600">{label}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
