import { limitations } from "../content";
import { SectionHeading } from "./section-heading";

export function LimitationsSection() {
    return (
        <section className="border-y border-line bg-surface-muted py-20 sm:py-28" id="limitations" aria-labelledby="limitations-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="A trustworthy demo states what is deferred and what cannot be recovered, rather than filling the gaps with synthetic evidence."
                    eyebrow="HONEST LIMITATIONS"
                    id="limitations-heading"
                    title="What the current release does not claim."
                />
                <ul className="mt-12 grid gap-4 md:grid-cols-2">
                    {limitations.map((limitation, index) => (
                        <li className="flex gap-4 rounded-xl border border-line bg-white p-5 text-sm leading-7 text-ink-600" key={limitation}>
                            <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 font-mono text-[10px] font-bold text-brand-700">{index + 1}</span>
                            <span>{limitation}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
