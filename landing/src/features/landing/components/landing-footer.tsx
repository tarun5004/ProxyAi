import { BrandLogo } from "@/components/brand-logo";

export function LandingFooter() {
    return (
        <footer className="border-t border-line">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <BrandLogo />
                <p className="max-w-lg text-sm leading-6 text-ink-600">
                    A security-focused portfolio project demonstrating tenant isolation, policy-aware AI access, and auditable operations.
                </p>
                <a className="text-sm font-semibold text-brand-700 hover:text-brand-500" href="https://github.com/tarun5004/ProxyAi" rel="noreferrer" target="_blank">
                    Source on GitHub
                </a>
            </div>
        </footer>
    );
}
