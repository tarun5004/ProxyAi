import { List } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { BrandLogo } from "@/components/layout/brand-logo";

const navigationItems = [
    { href: "#product", label: "Product" },
    { href: "#security", label: "Security" },
    { href: "#security", label: "Compliance" },
    { href: "#enterprise", label: "For Enterprise" },
    { href: "#about", label: "About" },
] as const;

export function LandingHeader() {
    return (
        <header className="relative z-30 mx-auto flex h-20 w-full max-w-295 items-center justify-between px-6 sm:h-24 lg:px-8">
            <Link href="/" aria-label="ProxiAI home">
                <BrandLogo compact />
            </Link>

            <nav className="hidden items-center gap-8 text-xs font-medium text-text-primary md:flex" aria-label="Primary navigation">
                {navigationItems.map((item) => (
                    <a
                        className="transition-colors duration-200 hover:text-brand focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                        href={item.href}
                        key={`${item.href}-${item.label}`}
                    >
                        {item.label}
                    </a>
                ))}
            </nav>

            <Link
                className="hidden min-h-10 items-center rounded-lg bg-brand px-5 text-xs font-semibold text-white shadow-[0_8px_20px_rgb(11_143_56_/_16%)] transition-colors duration-200 hover:bg-brand-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand/25 md:inline-flex"
                href="/login"
            >
                Log in
            </Link>

            <details className="group relative md:hidden">
                <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-xl border border-border-default bg-surface text-text-primary shadow-panel focus-visible:outline-3 focus-visible:outline-brand/20 [&::-webkit-details-marker]:hidden">
                    <List size={21} aria-hidden="true" />
                    <span className="sr-only">Open navigation</span>
                </summary>
                <nav
                    className="absolute top-14 right-0 grid w-56 gap-1 rounded-2xl border border-border-default bg-surface p-2.5 text-sm shadow-soft"
                    aria-label="Mobile navigation"
                >
                    {navigationItems.map((item) => (
                        <a
                            className="rounded-lg px-3 py-2.5 hover:bg-surface-green focus-visible:outline-2 focus-visible:outline-brand"
                            href={item.href}
                            key={`${item.href}-${item.label}`}
                        >
                            {item.label}
                        </a>
                    ))}
                    <Link className="mt-1 rounded-lg bg-brand px-3 py-2.5 text-center font-semibold text-white" href="/login">
                        Log in
                    </Link>
                </nav>
            </details>
        </header>
    );
}
