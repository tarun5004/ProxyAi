import { ArrowRight, LockKey, UserCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

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
                            Explore the real read-only admin dashboard and governed chat path without receiving or entering an administrator password.
                        </p>
                        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-text-muted">
                            <LockKey className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
                            Demo backend may take 1–2 minutes to wake after inactivity.
                        </p>
                        <Link className="mt-7 inline-flex min-h-11 items-center justify-center gap-3 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand/25" href="/demo-admin">
                            Open Admin Demo
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
