import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HomePage from "@/app/page";
import releaseEvidence from "@/content/release-evidence.json";

afterEach(cleanup);

describe("standalone recruiter landing", () => {
    it("renders the grounded product story and permanent handoff links", () => {
        render(<HomePage />);

        expect(screen.getByRole("heading", { level: 1, name: /Govern enterprise AI before sensitive data reaches a provider/i })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /A policy-aware gateway with explicit trust boundaries/i })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /Every request follows a deterministic order/i })).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "Try Live Demo" }).every((link) => link.getAttribute("href") === "https://app.proxiai.me/demo-admin")).toBe(true);
        expect(screen.getAllByRole("img", { name: "ProxyAi" }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole("link", { name: /GitHub|Inspect the code|Source on GitHub/i }).every((link) => link.getAttribute("href") === "https://github.com/tarun5004/ProxyAi")).toBe(true);
        expect(screen.getByText("Interactive demo may be started on demand.")).toBeInTheDocument();
    });

    it("shows exact policy, PII, RBAC, and storage boundaries without unsupported claims", () => {
        render(<HomePage />);

        for (const category of ["CONTACT_INFO", "FINANCIAL", "GOVERNMENT_ID", "CREDENTIAL", "INTERNAL_SECRET", "BUSINESS_CONFIDENTIAL"]) {
            expect(screen.getByText(category)).toBeInTheDocument();
        }

        for (const role of ["EMPLOYEE", "TEAM_LEAD", "ORG_ADMIN"]) {
            expect(screen.getByText(role)).toBeInTheDocument();
        }

        expect(screen.getByText(/zero provider calls are made/i)).toBeInTheDocument();
        expect(screen.getByText(/there is no plaintext fallback/i)).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/SUPER_ADMIN|Certified release evidence|Trusted by|SOC 2 certified|HSM-backed|automatic key rotation/i);
    });

    it("renders dated internal evidence from the checked release artifact", () => {
        render(<HomePage />);

        expect(screen.getByText("VERIFIED RELEASE EVIDENCE")).toBeInTheDocument();
        expect(screen.getByText(releaseEvidence.sourceCommit)).toBeInTheDocument();
        expect(screen.getByText(releaseEvidence.backendLineCoverage)).toBeInTheDocument();
        expect(screen.getByText(releaseEvidence.frontendLineCoverage)).toBeInTheDocument();
        expect(screen.getByText(/not an external certification/i)).toBeInTheDocument();
    });

    it("switches between interactive product surface previews", () => {
        render(<HomePage />);

        const policyTab = screen.getByRole("tab", { name: "Policy inspector" });
        fireEvent.click(policyTab);

        expect(policyTab).toHaveAttribute("aria-selected", "true");
        const policyPanel = screen.getByRole("tabpanel", { name: "Policy inspector" });
        expect(policyPanel).toBeInTheDocument();
        expect(within(policyPanel).getByText("ALLOW_WITH_MASK")).toBeInTheDocument();
    });

    it("keeps every gateway risk selectable without a hidden mobile-only control", () => {
        render(<HomePage />);

        const evidenceTab = screen.getByRole("tab", { name: /Missing operational evidence/i });
        fireEvent.click(evidenceTab);

        expect(evidenceTab).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tabpanel", { name: /Missing operational evidence/i })).toBeInTheDocument();
    });

    it("supports persistent lifecycle selection for touch and keyboard users", () => {
        render(<HomePage />);

        const maskButton = screen.getByRole("button", { name: /ALLOW_WITH_MASK/i });
        const policyStep = screen.getByText("ALLOW / MASK / BLOCK policy").closest("li");

        expect(maskButton).toHaveAttribute("aria-pressed", "false");
        fireEvent.focus(maskButton);
        expect(maskButton).toHaveAttribute("aria-pressed", "true");

        fireEvent.click(maskButton);
        fireEvent.blur(maskButton);

        expect(maskButton).toHaveAttribute("aria-pressed", "true");
        expect(policyStep).toHaveClass("bg-brand-50");
    });
});
