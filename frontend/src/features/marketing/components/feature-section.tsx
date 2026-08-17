import { Eye, LockKey, ShareNetwork, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

import { Reveal } from "../motion/reveal";

const features = [
    {
        description: "Enforce approved AI usage policies before any request reaches a provider.",
        icon: ShieldCheck,
        title: "Policy First",
    },
    {
        description: "Detect and mask sensitive data to reduce risk and protect confidentiality.",
        icon: LockKey,
        title: "Data Protection",
    },
    {
        description: "Understand decisions, usage, and routing without exposing sensitive content.",
        icon: Eye,
        title: "Full Visibility",
    },
    {
        description: "Keep one governed interface while your approved provider strategy evolves.",
        icon: ShareNetwork,
        title: "Provider Control",
    },
] as const;

export function FeatureSection() {
    return (
        <section className="border-y border-border-soft py-14 lg:py-15" id="security" aria-labelledby="features-heading">
            <div className="mx-auto w-full max-w-295 px-6 lg:px-8">
                <Reveal className="text-center">
                    <h2 className="text-2xl font-bold tracking-[-0.035em] text-text-primary sm:text-3xl" id="features-heading">
                        Why ProxiAI?
                    </h2>
                    <p className="mt-2 text-sm text-text-soft">Built for security, built for scale, built for enterprises.</p>
                </Reveal>

                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {features.map(({ description, icon: Icon, title }, index) => (
                        <Reveal delayMs={index * 70} key={title}>
                            <article className="h-full min-h-49 rounded-xl border border-border-default bg-surface p-6 shadow-[0_10px_35px_rgb(10_26_17_/_3%)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-1 hover:border-brand/25 hover:shadow-soft">
                                <Icon className="text-brand" size={27} aria-hidden="true" />
                                <h3 className="mt-7 text-sm font-bold text-text-primary">{title}</h3>
                                <p className="mt-3 text-sm leading-6 text-text-soft">{description}</p>
                            </article>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}
