import { CheckCircle, GitBranch, TestTube } from "@phosphor-icons/react/dist/ssr";

import { Reveal } from "../motion/reveal";

const evidence = [
    { label: "Backend coverage", value: "78.12% lines" },
    { label: "Frontend coverage", value: "77.20% lines" },
    { label: "Isolated integration", value: "63 / 63 passed" },
    { label: "Release harness", value: "20 bounded gates" },
] as const;

export function ReleaseEvidence() {
    return (
        <section className="border-y border-border-soft bg-[#fbfdfb] py-16 lg:py-18" id="evidence" aria-labelledby="evidence-heading">
            <div className="mx-auto grid w-full max-w-295 gap-10 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
                <Reveal>
                    <div className="flex items-center gap-2 text-brand-dark">
                        <TestTube size={23} aria-hidden="true" />
                        <p className="text-[11px] font-bold tracking-[0.08em]">CERTIFIED RELEASE EVIDENCE</p>
                    </div>
                    <h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-text-primary" id="evidence-heading">
                        Security claims backed by deterministic tests.
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-text-soft">
                        Latest certified local release evidence: 21 August 2026. It covers tenant isolation, Auth/RBAC, prompt egress, encryption, immutable audit, billing replay, pagination, Docker, and isolated MongoDB/Redis/BullMQ integration.
                    </p>
                    <a className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-dark hover:text-brand" href="https://github.com/tarun5004/ProxyAi" rel="noreferrer" target="_blank">
                        <GitBranch size={18} aria-hidden="true" />
                        Review the source and release harness
                    </a>
                </Reveal>

                <div className="grid gap-4 sm:grid-cols-2">
                    {evidence.map(({ label, value }, index) => (
                        <Reveal delayMs={index * 60} key={label}>
                            <div className="flex h-full items-start gap-4 rounded-2xl border border-border-default bg-surface p-5 shadow-panel">
                                <CheckCircle className="mt-0.5 shrink-0 text-brand" size={22} weight="fill" aria-hidden="true" />
                                <div>
                                    <p className="text-lg font-bold text-text-primary">{value}</p>
                                    <p className="mt-1 text-xs text-text-soft">{label}</p>
                                </div>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}
