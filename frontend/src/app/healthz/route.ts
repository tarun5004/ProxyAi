export const dynamic = "force-dynamic";

export function GET(): Response {
    return Response.json({
        service: "proxiai-frontend",
        status: "ok",
    });
}
