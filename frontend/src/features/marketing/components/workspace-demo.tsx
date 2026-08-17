import { Check, DotsThree, PaperPlaneTilt, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

export function WorkspaceDemo() {
    return (
        <div className="relative min-h-87 overflow-hidden rounded-2xl border border-border-default bg-surface shadow-[0_24px_70px_rgb(15_72_37_/_8%)]" aria-label="ProxiAI workspace preview">
            <div className="absolute inset-y-0 left-0 w-22 border-r border-border-soft bg-[#fbfdfb] p-4">
                <div className="text-lg font-black italic text-brand-dark">P</div>
                <div className="mt-8 space-y-3">
                    <span className="block h-2 rounded-full bg-brand/15" />
                    <span className="block h-2 w-3/4 rounded-full bg-border-default" />
                    <span className="block h-2 w-2/3 rounded-full bg-border-default" />
                    <span className="block h-2 w-4/5 rounded-full bg-border-default" />
                </div>
            </div>

            <div className="ml-22 flex min-h-87 flex-col p-5 sm:p-7">
                <div className="ml-auto max-w-[82%] rounded-xl bg-[#fbfcfb] px-4 py-3 text-xs text-text-soft shadow-panel">
                    Summarize the security risks of shadow AI.
                </div>

                <div className="mt-7 flex flex-1 gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-panel">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-green font-black italic text-brand-dark">P</span>
                    <div className="min-w-0 flex-1">
                        <DotsThree className="text-text-muted" size={24} weight="bold" aria-hidden="true" />
                        <div className="mt-3 space-y-2.5">
                            <span className="block h-2 w-full rounded-full bg-border-soft" />
                            <span className="block h-2 w-11/12 rounded-full bg-border-soft" />
                            <span className="block h-2 w-4/5 rounded-full bg-border-soft" />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-semibold text-brand-dark">
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-green px-2.5 py-1"><Check size={11} /> Policy checked</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-green px-2.5 py-1"><ShieldCheck size={11} /> ALLOW</span>
                        </div>
                    </div>
                </div>

                <div className="mt-5 flex min-h-12 items-center justify-between rounded-xl border border-brand/20 px-4 text-xs text-text-muted">
                    <span>Ask anything...</span>
                    <span className="grid size-7 place-items-center rounded-lg bg-brand text-white"><PaperPlaneTilt size={13} weight="fill" /></span>
                </div>
            </div>
        </div>
    );
}
