import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
    title: "ProxiAI | Governed enterprise AI gateway",
    description:
        "ProxiAI applies tenant policy, sensitive-data controls, and auditable operations before approved requests reach an AI provider.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="en">
            <body>
                <a
                    className="fixed top-3 left-3 z-50 -translate-y-20 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0"
                    href="#main-content"
                >
                    Skip to content
                </a>
                {children}
            </body>
        </html>
    );
}
