import { ArrowRight, Buildings } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Reveal } from "../motion/reveal";

export function FinalCta() {
    return (
        <section className="mx-auto w-full max-w-295 px-6 py-12 lg:px-8 lg:py-14" aria-labelledby="cta-heading">
            <Reveal>
                <div className="flex flex-col gap-7 rounded-2xl border border-brand/25 bg-[linear-gradient(105deg,#fbfffc,#f7fcf8)] px-6 py-8 shadow-[0_18px_50px_rgb(11_143_56_/_5%)] sm:flex-row sm:items-center sm:justify-between sm:px-9">
                    <div className="flex items-start gap-5">
                        <Buildings className="mt-1 shrink-0 text-brand" size={43} aria-hidden="true" />
                        <div>
                            <h2 className="text-lg font-bold text-text-primary" id="cta-heading">Ready to secure your AI usage?</h2>
                            <p className="mt-1.5 text-sm leading-6 text-text-soft">Join your organisation workspace to use ProxiAI safely.</p>
                            <p className="mt-1 text-xs text-text-muted">Access is provisioned by your organisation administrator.</p>
                        </div>
                    </div>
                    <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-4 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand/25" href="/login">
                        Log in to workspace
                        <ArrowRight size={16} weight="bold" aria-hidden="true" />
                    </Link>
                </div>
            </Reveal>
        </section>
    );
}
