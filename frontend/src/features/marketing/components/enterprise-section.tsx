import { CheckCircle } from "@phosphor-icons/react/dist/ssr";

import { Reveal } from "../motion/reveal";

const assurances = [
    "Tenant-scoped access",
    "Stateless frontend architecture",
    "Fail-closed policy and budget controls",
    "Auditable policy decisions",
] as const;

export function EnterpriseSection() {
    return (
        <section className="border-y border-border-soft bg-[#fbfdfb] py-14 lg:py-15" id="enterprise" aria-labelledby="enterprise-heading">
            <div className="mx-auto w-full max-w-295 px-6 lg:px-8">
                <Reveal className="text-center">
                    <h2 className="text-2xl font-bold tracking-[-0.035em] text-text-primary sm:text-3xl" id="enterprise-heading">
                        Enterprise-oriented controls by design
                    </h2>
                    <p className="mx-auto mt-3 max-w-150 text-sm leading-6 text-text-soft">
                        ProxiAI is designed for organisations that need secure access, reliable policy enforcement, and bounded operational evidence without claiming formal certification or multi-region availability.
                    </p>
                </Reveal>

                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {assurances.map((assurance, index) => (
                        <Reveal delayMs={index * 60} key={assurance}>
                            <div className="flex items-start gap-3 text-sm leading-6 text-text-soft">
                                <CheckCircle className="mt-0.5 shrink-0 text-brand" size={19} weight="fill" aria-hidden="true" />
                                <span>{assurance}</span>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}
