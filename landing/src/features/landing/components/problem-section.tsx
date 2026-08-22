import { problemStatements } from "../content";
import { SectionHeading } from "./section-heading";

export function ProblemSection() {
    return (
        <section className="border-y border-line bg-surface-muted py-20 sm:py-24" aria-labelledby="problem-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="ProxiAI inserts one trusted control boundary between employees and the external model path."
                    eyebrow="WHY A GATEWAY"
                    id="problem-heading"
                    title="Enterprise AI needs more than a direct provider key."
                />
                <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
                    {problemStatements.map((problem) => (
                        <article className="bg-white p-7 sm:p-8" key={problem.number}>
                            <p className="font-mono text-xs font-bold text-brand-700">{problem.number}</p>
                            <h3 className="mt-8 text-xl font-bold tracking-[-0.025em] text-ink-950">{problem.title}</h3>
                            <p className="mt-4 text-sm leading-7 text-ink-600">{problem.detail}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
