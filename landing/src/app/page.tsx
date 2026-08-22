import { ArchitectureSection } from "@/features/landing/components/architecture-section";
import { ControlsSection } from "@/features/landing/components/controls-section";
import { DeploymentSection } from "@/features/landing/components/deployment-section";
import { FinalCta } from "@/features/landing/components/final-cta";
import { LandingFooter } from "@/features/landing/components/landing-footer";
import { LandingHeader } from "@/features/landing/components/landing-header";
import { LifecycleSection } from "@/features/landing/components/lifecycle-section";
import { LimitationsSection } from "@/features/landing/components/limitations-section";
import { ProblemSection } from "@/features/landing/components/problem-section";
import { ProductSurfaces } from "@/features/landing/components/product-surfaces";
import { ReleaseEvidence } from "@/features/landing/components/release-evidence";
import { ReliabilitySection } from "@/features/landing/components/reliability-section";
import { TechnicalHero } from "@/features/landing/components/technical-hero";

export default function HomePage() {
    return (
        <div className="min-h-dvh overflow-x-hidden bg-white">
            <LandingHeader />
            <main id="main-content">
                <TechnicalHero />
                <ProblemSection />
                <ArchitectureSection />
                <LifecycleSection />
                <ProductSurfaces />
                <ControlsSection />
                <ReliabilitySection />
                <ReleaseEvidence />
                <DeploymentSection />
                <LimitationsSection />
                <FinalCta />
            </main>
            <LandingFooter />
        </div>
    );
}
