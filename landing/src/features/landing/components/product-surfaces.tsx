import { SectionHeading } from "./section-heading";

const surfaces = [
    ["Chat workspace", "Conversation navigation, policy-aware streaming, safe Markdown, and explicit retention context."],
    ["Policy inspector", "Decision, risk score, detected category counts, masking state, and authoritative provider routing."],
    ["Admin operations", "Tenant users, teams, policy, budget, retention, sessions, alerts, analytics, and append-only audit export."],
] as const;

export function ProductSurfaces() {
    return (
        <section className="py-20 sm:py-28" aria-labelledby="surfaces-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="The product UI exposes the same backend truth rather than recreating policy, billing, or provider rules in the browser."
                    eyebrow="PRODUCT SURFACES"
                    id="surfaces-heading"
                    title="Chat for employees. Evidence and controls for administrators."
                />
                <div className="mt-12 grid gap-5 lg:grid-cols-3">
                    {surfaces.map(([title, detail], index) => (
                        <article className="group overflow-hidden rounded-2xl border border-line bg-white shadow-panel" key={title}>
                            <div className="border-b border-line bg-surface-muted p-4">
                                <div className="flex items-center gap-2" aria-hidden="true">
                                    <span className="size-2 rounded-full bg-brand-500" />
                                    <span className="size-2 rounded-full bg-line" />
                                    <span className="size-2 rounded-full bg-line" />
                                </div>
                            </div>
                            <div className="p-6">
                                <p className="font-mono text-xs font-bold text-brand-700">SURFACE {index + 1}</p>
                                <h3 className="mt-4 text-xl font-bold text-ink-950">{title}</h3>
                                <p className="mt-3 text-sm leading-7 text-ink-600">{detail}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
