"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useAuth } from "@/features/auth/auth-provider";
import {
    createConversation,
    getConversation,
    listConversationMessages,
    listConversations,
} from "@/features/conversations/conversation.api";
import { ConversationSidebar } from "@/features/conversations/conversation-sidebar";
import type { ConversationSummary } from "@/features/conversations/conversation.types";
import { ApiError } from "@/lib/errors/api-error";

import { streamChat } from "./chat.api";
import { ChatCenter } from "./chat-center";
import type { UiChatMessage } from "./chat.types";

export function ChatWorkspace({ initialConversationId }: Readonly<{ initialConversationId?: string }>) {
    const auth = useAuth();
    const router = useRouter();
    const activeRequest = useRef<AbortController | undefined>(undefined);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [activeConversation, setActiveConversation] = useState<ConversationSummary>();
    const [retainedMessageCount, setRetainedMessageCount] = useState(0);
    const [messages, setMessages] = useState<UiChatMessage[]>([]);
    const [requestError, setRequestError] = useState<string>();
    const [streaming, setStreaming] = useState(false);
    const [creating, setCreating] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => () => activeRequest.current?.abort(), []);

    useEffect(() => {
        if (auth.status !== "authenticated" || !auth.accessToken) {
            return;
        }

        const abortController = new AbortController();

        void listConversations(auth.accessToken, abortController.signal)
            .then((response) => setConversations(response.data.items))
            .catch(() => setRequestError("Conversations could not be loaded."));

        return () => abortController.abort();
    }, [auth.accessToken, auth.status]);

    useEffect(() => {
        if (
            auth.status !== "authenticated"
            || !auth.accessToken
            || !initialConversationId
        ) {
            return;
        }

        const abortController = new AbortController();

        void Promise.all([
            getConversation(auth.accessToken, initialConversationId, abortController.signal),
            listConversationMessages(auth.accessToken, initialConversationId, abortController.signal),
        ]).then(([conversationResponse, messageResponse]) => {
            setActiveConversation(conversationResponse.data);
            setRetainedMessageCount(messageResponse.data.items.length);
        }).catch(() => {
            setRequestError("This conversation could not be loaded.");
            router.replace("/chat");
        });

        return () => abortController.abort();
    }, [auth.accessToken, auth.status, initialConversationId, router]);

    const handleCreate = useCallback(async () => {
        if (!auth.accessToken || creating) {
            return;
        }

        setCreating(true);
        setRequestError(undefined);

        try {
            const response = await createConversation(auth.accessToken);
            setConversations((current) => [response.data, ...current]);
            setActiveConversation(response.data);
            setMessages([]);
            setRetainedMessageCount(0);
            setSidebarOpen(false);
            router.push(`/chat/${response.data.conversationId}`);
        } catch {
            setRequestError("A new conversation could not be created.");
        } finally {
            setCreating(false);
        }
    }, [auth.accessToken, creating, router]);

    const handleSend = useCallback(async (prompt: string) => {
        if (!auth.accessToken || streaming) {
            return;
        }

        setStreaming(true);
        setRequestError(undefined);

        let conversation = activeConversation;

        try {
            if (!conversation) {
                const response = await createConversation(auth.accessToken);
                conversation = response.data;
                setActiveConversation(conversation);
                setConversations((current) => [conversation!, ...current]);
                router.replace(`/chat/${conversation.conversationId}`);
            }

            const userMessage: UiChatMessage = {
                id: crypto.randomUUID(),
                role: "user",
                content: prompt,
                state: "complete",
            };
            const assistantId = crypto.randomUUID();
            setMessages((current) => [
                ...current,
                userMessage,
                {
                    id: assistantId,
                    role: "assistant",
                    content: "",
                    state: "streaming",
                },
            ]);

            const abortController = new AbortController();
            activeRequest.current = abortController;

            for await (const event of streamChat({
                accessToken: auth.accessToken,
                conversationId: conversation.conversationId,
                prompt,
                signal: abortController.signal,
            })) {
                if (event.type === "token") {
                    updateAssistantMessage(setMessages, assistantId, (message) => ({
                        ...message,
                        content: message.content + event.data.text,
                    }));
                } else if (event.type === "done") {
                    updateAssistantMessage(setMessages, assistantId, (message) => ({
                        ...message,
                        state: "complete",
                    }));
                } else if (event.type === "error") {
                    updateAssistantMessage(setMessages, assistantId, (message) => ({
                        ...message,
                        state: "error",
                    }));
                    setRequestError("The response stream was interrupted. Please try again.");
                }
            }
        } catch (error: unknown) {
            setMessages((current) => current.filter((message) => message.state !== "streaming"));
            handleChatError(error, setRequestError);
        } finally {
            activeRequest.current = undefined;
            setStreaming(false);
        }
    }, [activeConversation, auth.accessToken, router, streaming]);

    async function handleLogout() {
        activeRequest.current?.abort();
        await auth.logout();
        router.replace("/login");
    }

    const roleLabel = auth.context?.role.replaceAll("_", " ") ?? "Member";

    return (
        <WorkspaceShell
            sidebar={<ConversationSidebar
                conversations={conversations}
                activeConversationId={activeConversation?.conversationId ?? initialConversationId}
                user={auth.user}
                roleLabel={roleLabel}
                open={sidebarOpen}
                creating={creating}
                onClose={() => setSidebarOpen(false)}
                onCreate={() => void handleCreate()}
                onLogout={() => void handleLogout()}
            />}
            main={<ChatCenter
                title={activeConversation?.title ?? "New Conversation"}
                messages={messages}
                retainedMessageCount={retainedMessageCount}
                streaming={streaming}
                error={requestError}
                onSend={handleSend}
                onOpenConversations={() => setSidebarOpen(true)}
            />}
            inspector={null}
            panelOpen={sidebarOpen}
            onDismissPanels={() => setSidebarOpen(false)}
        />
    );
}

function updateAssistantMessage(
    setMessages: React.Dispatch<React.SetStateAction<UiChatMessage[]>>,
    assistantId: string,
    update: (message: UiChatMessage) => UiChatMessage,
) {
    setMessages((current) => current.map((message) =>
        message.id === assistantId ? update(message) : message,
    ));
}

function handleChatError(
    error: unknown,
    setRequestError: React.Dispatch<React.SetStateAction<string | undefined>>,
) {
    if (error instanceof ApiError && error.code === "POLICY_BLOCKED") {
        setRequestError("Your organisation policy blocked this request before provider execution.");
        return;
    }

    if (error instanceof ApiError && error.code === "RATE_LIMITED") {
        setRequestError("Chat is temporarily rate limited. Please wait and try again.");
        return;
    }

    setRequestError("The request could not be completed safely. Please try again.");
}
