import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { AuthProvider } from "@/features/auth/auth-provider";

import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "ProxyAi",
    description: "Secure, policy-aware AI chat workspace.",
    icons: {
        icon: "/proxiai-logo.png",
    },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="en">
            <body className={inter.variable}>
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}
