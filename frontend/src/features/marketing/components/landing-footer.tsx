import Link from "next/link";

import { BrandLogo } from "@/components/layout/brand-logo";

const footerGroups = [
    { heading: "Product", links: [{ href: "#product", label: "Overview" }, { href: "#security", label: "Security" }, { href: "#enterprise", label: "Enterprise" }] },
    { heading: "Company", links: [{ href: "#about", label: "About" }, { href: "/login", label: "Workspace login" }] },
] as const;

export function LandingFooter() {
    return (
        <footer className="mx-auto w-full max-w-295 border-t border-border-soft px-6 py-10 lg:px-8" id="about">
            <div className="grid gap-9 sm:grid-cols-[1fr_auto_auto] sm:gap-16">
                <div>
                    <Link href="/" aria-label="ProxiAI home"><BrandLogo compact /></Link>
                    <p className="mt-4 max-w-70 text-xs leading-5 text-text-soft">Policy-aware AI proxy for secure enterprise usage.</p>
                </div>
                {footerGroups.map((group) => (
                    <div key={group.heading}>
                        <h2 className="text-xs font-bold text-text-primary">{group.heading}</h2>
                        <ul className="mt-4 space-y-2.5 text-xs text-text-soft">
                            {group.links.map((link) => <li key={link.label}><Link className="hover:text-brand" href={link.href}>{link.label}</Link></li>)}
                        </ul>
                    </div>
                ))}
            </div>
            <p className="mt-10 border-t border-border-soft pt-6 text-xs text-text-muted">© 2026 ProxiAI. All rights reserved.</p>
        </footer>
    );
}
