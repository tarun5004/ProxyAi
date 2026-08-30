import { AdminDashboard } from "@/features/admin/admin-dashboard";

export default async function AdminPage({
    searchParams,
}: Readonly<{
    searchParams: Promise<{ conversationId?: string }>;
}>) {
    const { conversationId } = await searchParams;

    return <AdminDashboard returnConversationId={conversationId} />;
}
