import { LandingFooter } from "@/features/landing/components/landing-footer";
import { LandingHeader } from "@/features/landing/components/landing-header";
import { TechnicalHero } from "@/features/landing/components/technical-hero";

export default function HomePage() {
    return (
        <div className="min-h-dvh overflow-x-hidden bg-white">
            <LandingHeader />
            <main id="main-content">
                <TechnicalHero />
            </main>
            <LandingFooter />
        </div>
    );
}
