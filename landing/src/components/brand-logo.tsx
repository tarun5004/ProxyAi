export function BrandLogo() {
    return (
        <span className="inline-flex items-center gap-3" aria-label="ProxiAI">
            <span className="relative block h-9 w-9" aria-hidden="true">
                <span className="absolute top-1 left-1 h-2.5 w-7 rounded-full bg-ink-950" />
                <span className="absolute top-2 left-1 h-6 w-2.5 -skew-x-12 rounded-full bg-brand-500" />
                <span className="absolute top-3.5 left-3 h-2.5 w-4.5 rounded-full bg-ink-950" />
            </span>
            <span className="text-xl font-bold tracking-[-0.04em] text-ink-950">
                Proxi<span className="text-brand-500">AI</span>
            </span>
        </span>
    );
}
