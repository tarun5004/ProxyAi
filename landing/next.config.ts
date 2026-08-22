import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        unoptimized: true,
    },
    output: "export",
    poweredByHeader: false,
    reactStrictMode: true,
    trailingSlash: true,
};

export default nextConfig;
