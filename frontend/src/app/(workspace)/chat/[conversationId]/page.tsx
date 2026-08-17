import { ChatWorkspace } from "@/features/chat/chat-workspace";

export default async function ConversationChatPage({
    params,
}: Readonly<{
    params: Promise<{ conversationId: string }>;
}>) {
    const { conversationId } = await params;

    return <ChatWorkspace initialConversationId={conversationId} />;
}
