export function TechnicalHero() {
    return (
        <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20 lg:pb-28" id="top">
            <div>
                <h1 className="max-w-3xl text-5xl leading-[1.02] font-bold tracking-[-0.055em] text-ink-950 sm:text-6xl lg:text-7xl">
                    Govern enterprise AI before sensitive data reaches a provider.
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-ink-600">
                    ProxiAI is a tenant-aware AI gateway that applies policy, protects sensitive information, and records auditable operational evidence before approved requests reach an AI provider.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <a className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-600" href="https://app.proxiai.me">
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

            <div className="relative mx-auto w-full max-w-xl" aria-label="ProxiAI governed request boundary">
                <div className="absolute inset-10 rounded-full bg-brand-100 blur-3xl" />
                <div className="relative rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-7">
                    <div className="grid gap-3 text-sm font-semibold text-ink-800">
                        <div className="rounded-xl border border-line bg-surface-muted px-4 py-3">User or application request</div>
                        <div className="mx-auto h-5 w-px bg-brand-200" />
                        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
                            <p className="text-xs font-bold tracking-[0.12em] text-brand-700">PROXIAI CONTROL BOUNDARY</p>
                            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                <span className="rounded-lg bg-white px-3 py-3 text-center shadow-panel">Tenant auth</span>
                                <span className="rounded-lg bg-white px-3 py-3 text-center shadow-panel">PII + policy</span>
                                <span className="rounded-lg bg-white px-3 py-3 text-center shadow-panel">Audit + usage</span>
                            </div>
                        </div>
                        <div className="mx-auto h-5 w-px bg-brand-200" />
                        <div className="rounded-xl border border-line bg-white px-4 py-3 text-center">Approved provider adapter</div>
                    </div>
                </div>
            </div>
        </section>
    );
}
