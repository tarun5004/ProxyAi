import {
    ChartLineUp,
    CloudArrowUp,
    Database,
    Key,
    Pulse,
    Queue,
} from "@phosphor-icons/react/dist/ssr";

import { Reveal } from "../motion/reveal";

const architectureAreas = [
    {
        detail: "Trusted organisation scope, current database permissions, Argon2id passwords, rotating refresh sessions, and exact-origin CORS.",
        icon: Key,
        title: "Identity and tenant boundary",
    },
    {
        detail: "Deterministic PII detection, explainable risk scoring, and ALLOW, MASK, or BLOCK before provider execution.",
        icon: Pulse,
        title: "Policy-aware request path",
    },
    {
        detail: "Provider adapters use bounded retry, circuit state, ordered pre-token fallback, and safe normalized failures.",
        icon: CloudArrowUp,
        title: "Provider reliability",
    },
    {
        detail: "Append-only usage records drive billing rollups; BullMQ workers reconcile billing, analytics, anomaly, health, and enqueue recovery.",
        icon: Queue,
        title: "Async accounting",
    },
    {
        detail: "AES-256-GCM encrypted message storage uses tenant/resource AAD; admin mutations append immutable audit events atomically.",
        icon: Database,
        title: "Encryption and audit",
    },
    {
        detail: "Bounded Prometheus metrics, worker heartbeats, safe structured logs, and operational runbooks expose health without prompt labels.",
        icon: ChartLineUp,
        title: "Observability",
    },
] as const;

export function ArchitectureSection() {
    return (
        <section className="py-16 lg:py-20" id="architecture" aria-labelledby="architecture-heading">
            <div className="mx-auto w-full max-w-295 px-6 lg:px-8">
                <Reveal className="max-w-190">
                    <p className="text-[11px] font-bold tracking-[0.08em] text-brand-dark">IMPLEMENTED ARCHITECTURE</p>
                    <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-text-primary sm:text-4xl" id="architecture-heading">
                        Security, reliability, and accounting share one trusted request boundary.
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-text-soft sm:text-base">
                        The Express API remains authoritative. Next.js renders the product surface, MongoDB stores tenant records, Redis coordinates request safety, and dedicated BullMQ workers process durable side effects.
                    </p>
                </Reveal>

                <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {architectureAreas.map(({ detail, icon: Icon, title }, index) => (
                        <Reveal delayMs={index * 50} key={title}>
                            <article className="h-full rounded-2xl border border-border-default bg-surface p-6 shadow-[0_12px_36px_rgb(10_26_17_/_4%)]">
                                <span className="grid size-11 place-items-center rounded-xl bg-surface-green text-brand-dark">
                                    <Icon size={23} aria-hidden="true" />
                                </span>
                                <h3 className="mt-5 text-base font-bold text-text-primary">{title}</h3>
                                <p className="mt-3 text-sm leading-6 text-text-soft">{detail}</p>
                            </article>
                        </Reveal>
                    ))}
                </div>

                <Reveal className="mt-8 rounded-2xl border border-brand/20 bg-surface-green/60 p-6" delayMs={100}>
                    <p className="text-xs font-bold tracking-[0.08em] text-brand-dark">AWS RELEASE SHAPE</p>
                    <p className="mt-2 text-sm leading-6 text-text-soft">
                        Immutable ECR images deploy as separate frontend, API, and worker ECS/Fargate services behind one ALB. The low-traffic demo uses one task per service and snapshot-driven deep stop/start for cost control; it is not a multi-task high-availability claim.
                    </p>
                </Reveal>
            </div>
        </section>
    );
}
