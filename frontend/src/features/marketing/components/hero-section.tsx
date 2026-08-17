import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { ProxyFlowVisual } from "./proxy-flow-visual";

export function HeroSection() {
    return (
        <section className="mx-auto grid w-full max-w-295 items-center gap-10 px-6 pt-10 pb-12 lg:grid-cols-[0.94fr_1.06fr] lg:px-8 lg:pt-14 lg:pb-14" id="product">
            <div className="motion-safe:animate-marketing-rise">
                <span className="inline-flex min-h-7 items-center rounded-full border border-brand/25 bg-surface px-3 text-[11px] font-semibold tracking-[0.02em] text-brand-dark">
                    POLICY-AWARE AI PROXY
                </span>
                <h1 className="mt-6 max-w-145 text-[clamp(2.65rem,4.25vw,3.75rem)] leading-[1.06] font-bold tracking-[-0.05em] text-text-primary">
                    Policy-Aware AI for the <span className="text-brand">Modern</span> Enterprise
                </h1>
                <p className="mt-6 max-w-135 text-base leading-7 text-text-soft sm:text-lg sm:leading-8">
                    ProxiAI sits between your users and AI providers to enforce policy, protect data, and deliver full visibility.
                </p>
                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                    <Link
                        className="inline-flex min-h-12 items-center justify-center gap-4 rounded-lg bg-brand px-6 text-sm font-semibold text-white shadow-[0_10px_28px_rgb(11_143_56_/_18%)] transition-[background,transform] duration-200 hover:-translate-y-px hover:bg-brand-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand/25"
                        href="/login"
                    >
                        Log in to workspace
                        <ArrowRight size={17} weight="bold" aria-hidden="true" />
                    </Link>
                    <span className="inline-flex items-center gap-2.5 text-sm text-text-soft">
                        <ShieldCheck size={21} className="text-brand" aria-hidden="true" />
                        Secure. Compliant. Observable.
                    </span>
                </div>
            </div>

            <ProxyFlowVisual />
        </section>
    );
}
