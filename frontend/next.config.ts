import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    poweredByHeader: false,
    reactStrictMode: true,
    async rewrites() {
        if (process.env.NODE_ENV === "production") {
            return [];
        }

        const backendOrigin = process.env.BACKEND_INTERNAL_ORIGIN
            ?? "http://localhost:8080";
        const parsedOrigin = new URL(backendOrigin);

        if (parsedOrigin.origin !== backendOrigin) {
            throw new Error(
                "BACKEND_INTERNAL_ORIGIN must be an exact URL origin.",
            );
        }

        return [
            {
                source: "/api/:path*",
                destination: `${backendOrigin}/api/:path*`,
            },
        ];
    },
};

export default nextConfig;
