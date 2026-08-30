export function TechnicalHero() {
    return (
        <section className="mx-auto grid w-full max-w-7xl items-center gap-16 px-5 pt-16 pb-24 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24 lg:pb-32" id="top">
            <div className="min-w-0">
                <p className="font-mono text-xs font-bold tracking-[0.14em] text-brand-700">
                    PROXIAI · REQUEST GATEWAY
                </p>
                <h1 className="mt-5 max-w-3xl text-5xl leading-[1.01] font-bold tracking-[-0.055em] text-ink-950 sm:text-6xl lg:text-[4.75rem]">
                    Govern enterprise AI before sensitive data reaches a provider.
                </h1>
                <p className="mt-7 max-w-xl text-lg leading-8 text-ink-600">
                    ProxiAI is a tenant-aware AI gateway that applies policy, protects sensitive information, and records auditable operational evidence before approved requests reach an AI provider.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <a className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-600" href="https://app.proxiai.me/demo-admin">
                        Try Live Demo <span className="ml-3" aria-hidden="true">→</span>
                    </a>
                    <a className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line bg-white px-6 text-sm font-semibold text-ink-950 transition hover:border-brand-200 hover:text-brand-700" href="https://github.com/tarun5004/ProxyAi" rel="noreferrer" target="_blank">
                        View GitHub
                    </a>
                    <a className="inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-sm font-semibold text-ink-800 hover:text-brand-700" href="#architecture">
                        Read architecture
                    </a>
                </div>
                <p className="mt-4 text-sm text-ink-600">Interactive demo may be started on demand.</p>
            </div>

            {/* Signature element: live request trace, terminal-style */}
            <div className="relative mx-auto min-w-0 w-full max-w-md" aria-label="Example governed request trace">
                <div className="absolute -inset-6 -z-10 rounded-full bg-brand-100 blur-3xl" aria-hidden="true" />
                <div className="overflow-hidden rounded-2xl border border-ink-950/10 bg-ink-950 shadow-soft">
                    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                        <span className="size-2.5 rounded-full bg-white/20" aria-hidden="true" />
                        <span className="size-2.5 rounded-full bg-white/20" aria-hidden="true" />
                        <span className="size-2.5 rounded-full bg-white/20" aria-hidden="true" />
                        <span className="ml-2 font-mono text-[11px] text-white/40">request-trace.log</span>
                    </div>
                    <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0 p-5 font-mono text-[13px] leading-7">
                        {[
                            ["auth", "tenant verified · org_4f2a", "done"],
                            ["policy", "PII detected · scope: contact_info", "done"],
                            ["decision", "ALLOW_WITH_MASK", "mask"],
                            ["provider", "groq · streaming response", "done"],
                            ["audit", "request logged · append-only", "done"],
                        ].map(([step, detail, kind]) => (
                            <li className="flex min-w-0 items-baseline gap-3 border-t border-white/5 py-2.5 first:border-t-0" key={step}>
                                <span className={`shrink-0 ${kind === "mask" ? "text-amber-400" : "text-brand-400"}`} aria-hidden="true">
                                    {kind === "mask" ? "◐" : "✓"}
                                </span>
                                <span className="shrink-0 text-white/40">{step}</span>
                                <span className="min-w-0 flex-1 truncate text-white/85">{detail}</span>
                            </li>
                        ))}
                    </ol>
                </div>
                <p className="mt-3 text-center text-xs text-ink-600">Representative trace · actual output streams live in the demo.</p>
            </div>
        </section>
    );
}
