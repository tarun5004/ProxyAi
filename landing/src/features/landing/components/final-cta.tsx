export function FinalCta() {
    return (
        <section className="px-5 py-20 sm:px-8 sm:py-28" aria-labelledby="cta-heading">
            <div className="mx-auto grid w-full max-w-7xl gap-8 rounded-3xl border border-brand-200 bg-brand-50 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-[-0.045em] text-ink-950" id="cta-heading">See the governed request path in action.</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">The public demo account is restricted to employee chat permissions and must not be used with real personal or confidential data.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <a className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-semibold text-white shadow-panel transition hover:bg-brand-600" href="https://app.proxiai.me">Try Live Demo</a>
                    <a className="inline-flex min-h-12 items-center justify-center rounded-lg border border-brand-200 bg-white px-6 text-sm font-semibold text-ink-950 hover:text-brand-700" href="https://github.com/tarun5004/ProxyAi" rel="noreferrer" target="_blank">Inspect the code</a>
                </div>
            </div>
        </section>
    );
}
