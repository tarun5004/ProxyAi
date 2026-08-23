import { BrandLogo } from "@/components/brand-logo";

const navigation = [
    ["#architecture", "Architecture"],
    ["#controls", "Controls"],
    ["#evidence", "Evidence"],
    ["#limitations", "Limitations"],
] as const;

export function LandingHeader() {
    return (
        <header className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:h-24 sm:px-8">
            <a href="#top" aria-label="ProxiAI home">
                <BrandLogo />
            </a>

            <nav className="hidden items-center gap-7 text-sm font-medium text-ink-800 md:flex" aria-label="Primary navigation">
                {navigation.map(([href, label]) => (
                    <a className="rounded-sm transition-colors hover:text-brand-600" href={href} key={href}>
                        {label}
                    </a>
                ))}
            </nav>

            <a
                className="hidden min-h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white shadow-panel transition hover:bg-brand-600 md:inline-flex"
                href="https://app.proxiai.me/demo-admin"
            >
                Try Live Demo
            </a>

            <details className="relative md:hidden">
                <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-xl border border-line bg-white text-ink-950 shadow-panel [&::-webkit-details-marker]:hidden">
                    <span aria-hidden="true">☰</span>
                    <span className="sr-only">Open navigation</span>
                </summary>
                <nav className="absolute top-14 right-0 z-20 grid w-56 gap-1 rounded-2xl border border-line bg-white p-2 text-sm shadow-soft" aria-label="Mobile navigation">
                    {navigation.map(([href, label]) => (
                        <a className="rounded-lg px-3 py-2.5 hover:bg-brand-50" href={href} key={href}>
                            {label}
                        </a>
                    ))}
                    <a className="mt-1 rounded-lg bg-brand-500 px-3 py-2.5 text-center font-semibold text-white" href="https://app.proxiai.me/demo-admin">
                        Try Live Demo
                    </a>
                </nav>
            </details>
        </header>
    );
}
