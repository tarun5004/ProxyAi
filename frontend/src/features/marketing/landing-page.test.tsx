import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { LandingHeader } from "@/features/marketing/components/landing-header";

describe("public landing experience", () => {
    it("renders the core product story and workspace calls to action", () => {
        render(<HomePage />);

        expect(screen.getByRole("heading", { level: 1, name: /Policy-Aware AI for the Modern Enterprise/i })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Why ProxiAI?" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "How ProxiAI works" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Enterprise ready by design" })).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: /Log in/i }).every((link) => link.getAttribute("href") === "/login")).toBe(true);
    });

    it("keeps marketing navigation anchored to implemented sections", () => {
        render(<LandingHeader />);

        expect(screen.getAllByRole("link", { name: "Product" }).every((link) => link.getAttribute("href") === "#product")).toBe(true);
        expect(screen.getAllByRole("link", { name: "Security" }).every((link) => link.getAttribute("href") === "#security")).toBe(true);
        expect(screen.getAllByRole("link", { name: "For Enterprise" }).every((link) => link.getAttribute("href") === "#enterprise")).toBe(true);
        expect(screen.getAllByRole("link", { name: "About" }).every((link) => link.getAttribute("href") === "#about")).toBe(true);
    });

    it("preserves the existing login route composition", async () => {
        vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8080");
        const [{ default: LoginPage }, { LoginScreen }] = await Promise.all([
            import("@/app/(auth)/login/page"),
            import("@/features/auth/login-screen"),
        ]);

        expect(LoginPage().type).toBe(LoginScreen);
        vi.unstubAllEnvs();
    });
});
