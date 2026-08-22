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
        expect(screen.getByRole("heading", { name: "Try the real governed chat path." })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Try the restricted demo" })).toHaveAttribute("href", "/login?demo=public");
        expect(screen.getByRole("link", { name: "Open demo login" })).toHaveAttribute("href", "/login?demo=public");
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

    it("shows a restricted employee demo without exposing a password", () => {
        render(<HomePage />);

        expect(screen.getByText("novastack")).toBeInTheDocument();
        expect(screen.getByText("demo@novastack.demo")).toBeInTheDocument();
        expect(screen.getByText(/no admin, billing, audit-export, policy, or team-log permissions/i)).toBeInTheDocument();
        expect(screen.getByText(/Interactive demo access may be started on demand/i)).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/DEMO_PUBLIC_PASSWORD|ORG_ADMIN password/i);
        expect(document.body.textContent).not.toMatch(/Trusted by|SOC 2 certified/i);
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
