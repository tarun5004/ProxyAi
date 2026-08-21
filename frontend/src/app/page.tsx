import { EnterpriseSection } from "@/features/marketing/components/enterprise-section";
import { FeatureSection } from "@/features/marketing/components/feature-section";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { HeroSection } from "@/features/marketing/components/hero-section";
import { LandingFooter } from "@/features/marketing/components/landing-footer";
import { LandingHeader } from "@/features/marketing/components/landing-header";
import { ProblemSection } from "@/features/marketing/components/problem-section";
import { ReleaseEvidence } from "@/features/marketing/components/release-evidence";
import { TrustStrip } from "@/features/marketing/components/trust-strip";
import { WorkflowSection } from "@/features/marketing/components/workflow-section";

export default function HomePage() {
    return (
        <div className="min-h-dvh overflow-x-hidden bg-app-bg">
            <LandingHeader />
            <main>
                <HeroSection />
                <TrustStrip />
                <ProblemSection />
                <FeatureSection />
                <WorkflowSection />
                <ArchitectureSection />
                <EnterpriseSection />
                <ReleaseEvidence />
                <DemoAccessSection />
                <FinalCta />
            </main>
            <LandingFooter />
        </div>
    );
}
import { ArchitectureSection } from "@/features/marketing/components/architecture-section";
import { DemoAccessSection } from "@/features/marketing/components/demo-access-section";
