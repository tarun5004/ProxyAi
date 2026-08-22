import { SectionHeading } from "./section-heading";

const services = [
    ["Route53 + ACM", "Public DNS and TLS"],
    ["Application Load Balancer", "Frontend default; /api and /health to API"],
    ["Next.js task", "Public product surface"],
    ["Express API task", "Authoritative application boundary"],
    ["BullMQ worker task", "Private, long-running background processing"],
    ["Atlas + Redis + Groq", "External runtime dependencies reached from private application networking"],
] as const;

export function DeploymentSection() {
    return (
        <section className="py-20 sm:py-28" aria-labelledby="deployment-heading">
            <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
                <SectionHeading
                    description="Immutable ECR images define separate frontend, API, and worker ECS/Fargate services. Secrets stay in AWS Secrets Manager rather than the frontend bundle or image layers."
                    eyebrow="CANONICAL DEPLOYMENT"
                    id="deployment-heading"
                    title="AWS ECS/Fargate with a private application tier."
                />
                <div className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-7">
                    <ol className="grid gap-3">
                        {services.map(([title, detail], index) => (
                            <li className="grid gap-2 rounded-xl border border-line bg-surface-muted p-4 sm:grid-cols-[2.25rem_12rem_1fr] sm:items-center" key={title}>
                                <span className="grid size-8 place-items-center rounded-full bg-brand-500 font-mono text-xs font-bold text-white">{index + 1}</span>
                                <strong className="text-sm text-ink-950">{title}</strong>
                                <span className="text-sm leading-6 text-ink-600">{detail}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-brand-700">The low-traffic demo uses one task per service and snapshot-driven deep stop/start for cost control. This is not a multi-task high-availability claim.</p>
                </div>
            </div>
        </section>
    );
}
