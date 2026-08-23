import type { NextConfig } from "next";

export const VERCEL_BACKEND_ORIGIN = "https://proxiai-api.onrender.com";

type FrontendBuildEnvironment = Partial<Pick<
    NodeJS.ProcessEnv,
    "BACKEND_INTERNAL_ORIGIN" | "NODE_ENV" | "VERCEL"
>>;

export function createNextConfig(
    environment: FrontendBuildEnvironment,
): NextConfig {
    const isVercelBuild = environment.VERCEL === "1";

    return {
        ...(isVercelBuild ? {} : { output: "standalone" as const }),
        poweredByHeader: false,
        reactStrictMode: true,
        async rewrites() {
            const backendOrigin = isVercelBuild
                ? VERCEL_BACKEND_ORIGIN
                : environment.BACKEND_INTERNAL_ORIGIN
                    ?? (environment.NODE_ENV === "production"
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
}

const nextConfig = createNextConfig(process.env);

export default nextConfig;
