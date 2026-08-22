import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    poweredByHeader: false,
    reactStrictMode: true,
    async rewrites() {
        const backendOrigin = process.env.BACKEND_INTERNAL_ORIGIN
            ?? (process.env.NODE_ENV === "production"
                ? undefined
                : "http://localhost:8080");

        if (!backendOrigin) {
            return [];
        }

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
            {
                source: "/health/:path*",
                destination: `${backendOrigin}/health/:path*`,
            },
        ];
    },
};

export default nextConfig;
