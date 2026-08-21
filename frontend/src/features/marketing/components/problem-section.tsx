import { EyeSlash, ShieldWarning, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { Reveal } from "../motion/reveal";

const problems = [
    {
        detail: "Direct AI usage can bypass organisation policy and approval boundaries.",
        icon: WarningCircle,
        title: "Uncontrolled AI access",
    },
    {
        detail: "Prompts may contain credentials, personal data, or internal connection details.",
        icon: ShieldWarning,
        title: "Sensitive-data egress",
    },
    {
        detail: "Security and operations teams need usage, decision, and audit evidence without storing plaintext prompts.",
        icon: EyeSlash,
        title: "Missing governance evidence",
    },
] as const;

export function ProblemSection() {
    return (
        <section className="border-y border-border-soft bg-[#fbfdfb] py-14 lg:py-18" aria-labelledby="problem-heading">
            <div className="mx-auto w-full max-w-295 px-6 lg:px-8">
                <Reveal className="max-w-180">
                    <p className="text-[11px] font-bold tracking-[0.08em] text-brand-dark">THE PROBLEM</p>
                    <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-text-primary sm:text-4xl" id="problem-heading">
                        Enterprise AI needs a control plane, not another chat wrapper.
                    </h2>
                </Reveal>
                <div className="mt-9 grid gap-5 md:grid-cols-3">
                    {problems.map(({ detail, icon: Icon, title }, index) => (
                        <Reveal delayMs={index * 70} key={title}>
                            <article className="h-full rounded-2xl border border-border-default bg-surface p-6 shadow-panel">
                                <Icon className="text-brand" size={27} aria-hidden="true" />
                                <h3 className="mt-5 text-base font-bold text-text-primary">{title}</h3>
                                <p className="mt-3 text-sm leading-6 text-text-soft">{detail}</p>
                            </article>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}
