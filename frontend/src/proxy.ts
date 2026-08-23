import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const VERCEL_BACKEND_ORIGIN = "https://proxiai-api-v2.onrender.com";

function isSameOriginRequest(request: NextRequest): boolean {
    const origin = request.headers.get("origin");

    return origin === null || origin === request.nextUrl.origin;
}

export function proxy(request: NextRequest): NextResponse {
    if (process.env.VERCEL !== "1") {
        return NextResponse.next();
    }

    if (!isSameOriginRequest(request)) {
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: "ORIGIN_DENIED",
                    message: "Origin is not allowed.",
                },
            },
            { status: 403 },
        );
    }

    const destination = new URL(
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
        VERCEL_BACKEND_ORIGIN,
    );
    const upstreamHeaders = new Headers(request.headers);

    upstreamHeaders.delete("origin");

    return NextResponse.rewrite(destination, {
        request: {
            headers: upstreamHeaders,
        },
    });
}

export const config = {
    matcher: ["/api/:path*", "/health/:path*"],
};
