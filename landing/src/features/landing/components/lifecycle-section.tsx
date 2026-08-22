import { lifecycleSteps, policyActions } from "../content";
import { SectionHeading } from "./section-heading";

const actionTone = {
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    green: "border-brand-200 bg-brand-50 text-brand-700",
    red: "border-red-200 bg-red-50 text-red-900",
} as const;

export function LifecycleSection() {
    return (
        <section className="border-y border-line bg-surface-muted py-20 sm:py-28" aria-labelledby="lifecycle-heading">
            <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
                <div>
                    <SectionHeading
                        description="Security checks happen before provider execution. Persistence and background work happen only through approved boundaries after the outcome is known."
                        eyebrow="REAL REQUEST LIFECYCLE"
                        id="lifecycle-heading"
                        title="Every request follows a deterministic order."
                    />
                    <div className="mt-8 grid gap-3">
                        {policyActions.map((policy) => (
                            <article className={`rounded-xl border p-4 ${actionTone[policy.tone]}`} key={policy.action}>
                                <h3 className="font-mono text-xs font-bold">{policy.action}</h3>
                                <p className="mt-2 text-sm leading-6">{policy.detail}</p>
                            </article>
                        ))}
                    </div>
                </div>

                <ol className="grid gap-0 rounded-2xl border border-line bg-white p-5 shadow-panel sm:grid-cols-2 sm:p-7">
                    {lifecycleSteps.map((step, index) => (
                        <li className="relative flex min-h-16 items-center gap-4 border-b border-line py-4 last:border-b-0 sm:odd:border-r sm:odd:pr-5 sm:even:pl-5 sm:[&:nth-last-child(-n+2)]:border-b-0" key={step}>
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-950 font-mono text-xs font-bold text-white">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="text-sm font-semibold text-ink-800">{step}</span>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}
