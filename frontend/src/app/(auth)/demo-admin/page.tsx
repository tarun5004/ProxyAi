import { PublicAdminDemoScreen } from "@/features/auth/public-admin-demo-screen";

interface DemoAdminPageProps {
    readonly searchParams: Promise<{
        readonly expired?: string | string[];
    }>;
}

export default async function DemoAdminPage({
    searchParams,
}: DemoAdminPageProps) {
    const { expired } = await searchParams;
    return <PublicAdminDemoScreen expired={expired === "1"} />;
}
