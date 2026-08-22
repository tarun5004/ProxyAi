import { LoginScreen } from "@/features/auth/login-screen";
import { getPublicDemoLoginDefaults } from "@/features/auth/public-demo";

interface LoginPageProps {
    readonly searchParams: Promise<{
        readonly demo?: string | string[];
    }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const { demo } = await searchParams;

    return <LoginScreen initialValues={getPublicDemoLoginDefaults(demo)} />;
}
