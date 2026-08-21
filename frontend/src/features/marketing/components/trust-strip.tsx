import { Buildings, Fingerprint, Scales, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

const trustItems = [
    { icon: Fingerprint, label: "Tenant isolated" },
    { icon: ShieldCheck, label: "Policy enforced" },
    { icon: Scales, label: "Sensitive-data aware" },
    { icon: Buildings, label: "Enterprise-oriented controls" },
] as const;

export function TrustStrip() {
    return (
        <section className="mx-auto w-full max-w-295 px-6 pb-12 lg:px-8 lg:pb-14" aria-labelledby="trust-heading">
            <p className="text-center text-xs font-medium text-text-muted" id="trust-heading">
                Designed and verified for security-conscious engineering teams
            </p>
            <div className="mx-auto mt-7 grid max-w-190 grid-cols-2 gap-x-8 gap-y-6 text-text-muted sm:grid-cols-4">
                {trustItems.map(({ icon: Icon, label }) => (
                    <div className="flex items-center justify-center gap-2.5 text-xs font-medium" key={label}>
                        <Icon className="text-brand/70" size={24} aria-hidden="true" />
                        <span>{label}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}
