import { HeroSection } from "@/features/marketing/components/hero-section";
import { LandingHeader } from "@/features/marketing/components/landing-header";

export default function HomePage() {
    return (
        <div className="min-h-dvh overflow-x-hidden bg-app-bg">
            <LandingHeader />
            <main>
                <HeroSection />
            </main>
        </div>
    );
}
