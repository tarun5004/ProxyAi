import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import LoginPage from "@/app/(auth)/login/page";
import HomePage from "@/app/page";
import { LoginScreen } from "@/features/auth/login-screen";
import { LandingHeader } from "@/features/marketing/components/landing-header";

afterEach(cleanup);

describe("public landing experience", () => {
    it("renders the core product story and workspace calls to action", () => {
        render(<HomePage />);

        expect(screen.getByRole("heading", { level: 1, name: /Govern enterprise AI before sensitive data reaches a provider/i })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /Enterprise AI needs a control plane/i })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Security controls before provider access" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "How ProxiAI works" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /Security, reliability, and accounting/i })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Security claims backed by deterministic tests." })).toBeInTheDocument();
        expect(screen.getByText("VERIFIED RELEASE EVIDENCE")).toBeInTheDocument();
        expect(screen.getByText("78.24% lines")).toBeInTheDocument();
        expect(screen.getByText("77.62% lines")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Try the real governed chat path." })).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "Open Admin Demo" }).every((link) => link.getAttribute("href") === "/demo-admin")).toBe(true);
        expect(screen.getAllByRole("link", { name: /Log in/i }).every((link) => link.getAttribute("href") === "/login")).toBe(true);
    });

    it("keeps marketing navigation anchored to implemented sections", () => {
        render(<LandingHeader />);

        expect(screen.getAllByRole("link", { name: "Product" }).every((link) => link.getAttribute("href") === "#product")).toBe(true);
        expect(screen.getAllByRole("link", { name: "Architecture" }).every((link) => link.getAttribute("href") === "#architecture")).toBe(true);
        expect(screen.getAllByRole("link", { name: "Security" }).every((link) => link.getAttribute("href") === "#security")).toBe(true);
        expect(screen.getAllByRole("link", { name: "Evidence" }).every((link) => link.getAttribute("href") === "#evidence")).toBe(true);
        expect(screen.getAllByRole("link", { name: "Demo" }).every((link) => link.getAttribute("href") === "#demo")).toBe(true);
    });

    it("shows a passwordless read-only admin demo without exposing credentials", () => {
        render(<HomePage />);

        expect(screen.getByText(/read-only admin dashboard/i)).toBeInTheDocument();
        expect(screen.getByText(/may take 1–2 minutes to wake/i)).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/DEMO_PUBLIC_PASSWORD|ORG_ADMIN password/i);
        expect(document.body.textContent).not.toMatch(/admin-demo@novastack\.demo/i);
        expect(document.body.textContent).not.toMatch(/Trusted by|SOC 2 certified|Certified release evidence|Latest certified/i);
    });

    it("prefills only approved public identifiers and keeps a home path", async () => {
        const page = await LoginPage({
            searchParams: Promise.resolve({ demo: "public" }),
        });

        expect(page.type).toBe(LoginScreen);
        expect(page.props.initialValues).toEqual({
            email: "demo@novastack.demo",
            organisationSlug: "novastack",
        });

        const arbitraryQuery = await LoginPage({
            searchParams: Promise.resolve({ demo: ["public"] }),
        });
        expect(arbitraryQuery.props.initialValues).toBeUndefined();
    });
});
