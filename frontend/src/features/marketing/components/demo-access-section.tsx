import { ArrowRight, LockKey, UserCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { PUBLIC_DEMO_LOGIN } from "@/features/auth/public-demo";

import { Reveal } from "../motion/reveal";

const limitations = [
    "Attachments are not implemented in the current MVP.",
    "Prompt cache and safe response replay remain deferred.",
    "Exact provider usage is never estimated when an interrupted stream omits usage.",
    "The public demo is single-task, low-traffic infrastructure.",
    "No external penetration-test or compliance certification is claimed.",
] as const;

export function DemoAccessSection() {
    return (
        <section className="py-16 lg:py-20" id="demo" aria-labelledby="demo-heading">
            <div className="mx-auto grid w-full max-w-295 gap-6 px-6 lg:grid-cols-2 lg:px-8">
                <Reveal>
                    <article className="h-full rounded-2xl border border-brand/25 bg-[linear-gradient(135deg,#fbfffc,#f2faf4)] p-7 shadow-soft sm:p-8">
                        <UserCircle className="text-brand" size={36} aria-hidden="true" />
                        <p className="mt-6 text-[11px] font-bold tracking-[0.08em] text-brand-dark">RESTRICTED RECRUITER DEMO</p>
                        <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-text-primary" id="demo-heading">Try the real governed chat path.</h2>
                        <p className="mt-4 text-sm leading-7 text-text-soft">
                            Use the dedicated NovaStack employee account. It can send chat and view only its own conversations; it has no admin, billing, audit-export, policy, or team-log permissions.
                        </p>
                        <dl className="mt-6 grid gap-3 rounded-xl border border-brand/15 bg-white/80 p-4 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-xs text-text-muted">Organisation</dt>
                                <dd className="mt-1 font-semibold text-text-primary">novastack</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-text-muted">Email</dt>
                                <dd className="mt-1 font-semibold text-text-primary">demo@novastack.demo</dd>
                            </div>
                        </dl>
                        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-text-muted">
                            <LockKey className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
                            Interactive demo access may be started on demand. The rotating password is delivered separately and never stored in source control.
                        </p>
                        <Link className="mt-7 inline-flex min-h-11 items-center justify-center gap-3 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand/25" href={PUBLIC_DEMO_LOGIN.href}>
                            Open demo login
                            <ArrowRight size={16} weight="bold" aria-hidden="true" />
                        </Link>
                    </article>
                </Reveal>

                <Reveal delayMs={90}>
                    <article className="h-full rounded-2xl border border-border-default bg-surface p-7 shadow-panel sm:p-8" aria-labelledby="limitations-heading">
                        <p className="text-[11px] font-bold tracking-[0.08em] text-brand-dark">HONEST BOUNDARIES</p>
                        <h2 className="mt-3 text-2xl font-bold tracking-[-0.035em] text-text-primary" id="limitations-heading">What this release does not claim</h2>
                        <ul className="mt-6 space-y-4">
                            {limitations.map((limitation) => (
                                <li className="flex gap-3 text-sm leading-6 text-text-soft" key={limitation}>
                                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                                    <span>{limitation}</span>
                                </li>
                            ))}
                        </ul>
                    </article>
                </Reveal>
            </div>
        </section>
    );
}
