"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useAuth } from "@/features/auth/auth-provider";
import {
    createConversation,
    getConversation,
    listConversationMessages,
    listConversations,
    updateConversationTitle,
} from "@/features/conversations/conversation.api";
import { ConversationSidebar } from "@/features/conversations/conversation-sidebar";
import type { ConversationSummary } from "@/features/conversations/conversation.types";
import type { MessageSummary } from "@/features/conversations/conversation.types";
import { PolicyInspector } from "@/features/policy/policy-inspector";
import { getRoutingDisplayState } from "@/features/policy/routing-display";
import { appendUniquePage } from "@/lib/api/cursor-pagination";
import { ApiError } from "@/lib/errors/api-error";

import { streamChat } from "./chat.api";
import { ChatCenter } from "./chat-center";
import type {
    DoneEvent,
    FallbackEvent,
    PolicyEvent,
    RoutingEvent,
    UiChatMessage,
} from "./chat.types";

const policyBlockedDetailsSchema = z.object({
    riskScore: z.number().min(0).max(100),
    categories: z.array(z.string()),
});

export function ChatWorkspace({ initialConversationId }: Readonly<{ initialConversationId?: string }>) {
    const auth = useAuth();
    const router = useRouter();
    const activeRequest = useRef<AbortController | undefined>(undefined);
    const requestInFlight = useRef(false);
    const activePageRequests = useRef(new Set<"conversations" | "messages">());
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [conversationListStatus, setConversationListStatus] = useState<"error" | "loading" | "ready">("loading");
    const [conversationListReload, setConversationListReload] = useState(0);
    const [conversationNextCursor, setConversationNextCursor] = useState<string | null>(null);
    const [conversationPageStatus, setConversationPageStatus] = useState<"error" | "idle" | "loading">("idle");
    const [activeConversation, setActiveConversation] = useState<ConversationSummary>();
    const [conversationStatus, setConversationStatus] = useState<"error" | "idle" | "loading" | "ready">(
        initialConversationId ? "loading" : "idle",
    );
    const [retainedMessages, setRetainedMessages] = useState<MessageSummary[]>([]);
    const [messageNextCursor, setMessageNextCursor] = useState<string | null>(null);
    const [messagePageStatus, setMessagePageStatus] = useState<"error" | "idle" | "loading">("idle");
    const [messages, setMessages] = useState<UiChatMessage[]>([]);
    const [policy, setPolicy] = useState<PolicyEvent>();
    const [routing, setRouting] = useState<RoutingEvent>();
    const [fallback, setFallback] = useState<FallbackEvent>();
    const [completion, setCompletion] = useState<DoneEvent>();
    const [requestError, setRequestError] = useState<string>();
    const [streaming, setStreaming] = useState(false);
    const [creating, setCreating] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [inspectorOpen, setInspectorOpen] = useState(false);

    useEffect(() => () => {
        activeRequest.current?.abort();
        activeRequest.current = undefined;
    }, [initialConversationId]);

    useEffect(() => {
        if (auth.status !== "authenticated" || !auth.accessToken) {
            return;
        }

        const abortController = new AbortController();

        void listConversations(auth.accessToken, { signal: abortController.signal })
            .then((response) => {
                setConversations(response.data.items);
                setConversationNextCursor(response.meta.nextCursor ?? null);
                setConversationPageStatus("idle");
                setConversationListStatus("ready");
            })
            .catch((error: unknown) => {
                if (!isAbortError(error)) {
                    setConversationListStatus("error");
                }
            });

        return () => abortController.abort();
    }, [auth.accessToken, auth.status, conversationListReload]);

    useEffect(() => {
        if (auth.status !== "authenticated" || !auth.accessToken) {
            return;
        }

        if (!initialConversationId) {
            return;
        }

        const abortController = new AbortController();

        void Promise.all([
            getConversation(auth.accessToken, initialConversationId, abortController.signal),
            listConversationMessages(auth.accessToken, initialConversationId, {
                signal: abortController.signal,
            }),
        ]).then(([conversationResponse, messageResponse]) => {
            setActiveConversation(conversationResponse.data);
            setRetainedMessages(messageResponse.data.items);
            setMessageNextCursor(messageResponse.meta.nextCursor ?? null);
            setMessagePageStatus("idle");
            setConversationStatus("ready");
        }).catch((error: unknown) => {
            if (isAbortError(error)) {
                return;
            }

            setActiveConversation(undefined);
            setRetainedMessages([]);
            setMessageNextCursor(null);
            setConversationStatus("error");
        });

        return () => abortController.abort();
    }, [auth.accessToken, auth.status, initialConversationId]);

    const handleLoadMoreConversations = useCallback(async () => {
        if (
            !auth.accessToken
            || conversationNextCursor === null
            || conversationPageStatus === "loading"
            || activePageRequests.current.has("conversations")
        ) {
            return;
        }

        const cursor = conversationNextCursor;
        activePageRequests.current.add("conversations");
        setConversationPageStatus("loading");

        try {
            const response = await listConversations(auth.accessToken, { cursor });
            setConversations((current) => appendUniquePage(
                current,
                response.data.items,
                (conversation) => conversation.conversationId,
            ));
            setConversationNextCursor(response.meta.nextCursor ?? null);
            setConversationPageStatus("idle");
        } catch {
            setConversationPageStatus("error");
        } finally {
            activePageRequests.current.delete("conversations");
        }
    }, [auth.accessToken, conversationNextCursor, conversationPageStatus]);

    const handleLoadMoreMessages = useCallback(async () => {
        if (
            !auth.accessToken
            || !initialConversationId
            || messageNextCursor === null
            || messagePageStatus === "loading"
            || activePageRequests.current.has("messages")
        ) {
            return;
        }

        const cursor = messageNextCursor;
        activePageRequests.current.add("messages");
        setMessagePageStatus("loading");

        try {
            const response = await listConversationMessages(
                auth.accessToken,
                initialConversationId,
                { cursor },
            );
            setRetainedMessages((current) => appendUniquePage(
                current,
                response.data.items,
                (message) => message.messageId,
            ));
            setMessageNextCursor(response.meta.nextCursor ?? null);
            setMessagePageStatus("idle");
        } catch {
            setMessagePageStatus("error");
        } finally {
            activePageRequests.current.delete("messages");
        }
    }, [auth.accessToken, initialConversationId, messageNextCursor, messagePageStatus]);

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
            setConversationStatus("ready");
            setMessages([]);
            setRetainedMessages([]);
            setPolicy(undefined);
            setRouting(undefined);
            setFallback(undefined);
            setCompletion(undefined);
            setSidebarOpen(false);
            router.push(`/chat/${response.data.conversationId}`);
        } catch {
            setRequestError("A new conversation could not be created.");
        } finally {
            setCreating(false);
        }
    }, [auth.accessToken, creating, router]);

    const handleSend = useCallback(async (prompt: string, retryAssistantId?: string) => {
        if (!auth.accessToken || requestInFlight.current) {
            return;
        }

        requestInFlight.current = true;
        setStreaming(true);
        setRequestError(undefined);
        setPolicy(undefined);
        setRouting(undefined);
        setFallback(undefined);
        setCompletion(undefined);
        setInspectorOpen(true);

        let conversation = activeConversation;
        let assistantId: string | undefined;

        try {
            if (!conversation) {
                const response = await createConversation(auth.accessToken);
                conversation = response.data;
                setActiveConversation(conversation);
                setConversationStatus("ready");
                setConversations((current) => [conversation!, ...current]);
                router.replace(`/chat/${conversation.conversationId}`);
            }

            const createdAssistantId = crypto.randomUUID();
            assistantId = createdAssistantId;
            setMessages((current) => {
                const assistantMessage: UiChatMessage = {
                    id: createdAssistantId,
                    role: "assistant",
                    content: "",
                    createdAt: new Date().toISOString(),
                    retryable: false,
                    state: "streaming",
                };

                if (retryAssistantId) {
                    return current.map((message) =>
                        message.id === retryAssistantId
                            ? assistantMessage
                            : message,
                    );
                }

                return [
                    ...current,
                    {
                        id: crypto.randomUUID(),
                        role: "user",
                        content: prompt,
                        createdAt: new Date().toISOString(),
                        state: "complete",
                    },
                    assistantMessage,
                ];
            });

            const abortController = new AbortController();
            activeRequest.current = abortController;
            const clientRequestId = crypto.randomUUID();

            for await (const event of streamChat({
                accessToken: auth.accessToken,
                clientRequestId,
                conversationId: conversation.conversationId,
                prompt,
                signal: abortController.signal,
            })) {
                if (event.type === "policy") {
                    setPolicy(event.data);
                } else if (event.type === "routing") {
                    setRouting(event.data);
                } else if (event.type === "fallback") {
                    setFallback(event.data);
                } else if (event.type === "token") {
                    updateAssistantMessage(setMessages, assistantId, (message) => ({
                        ...message,
                        content: message.content + event.data.text,
                    }));
                } else if (event.type === "done") {
                    setCompletion(event.data);
                    updateAssistantMessage(setMessages, assistantId, (message) => ({
                        ...message,
                        createdAt: new Date().toISOString(),
                        retryable: false,
                        state: "complete",
                    }));
                } else if (event.type === "error") {
                    updateAssistantMessage(setMessages, assistantId, (message) => ({
                        ...message,
                        createdAt: new Date().toISOString(),
                        retryable: event.data.retryable,
                        state: "error",
                    }));
                    setRequestError("The response stream was interrupted. Please try again.");
                }
            }
        } catch (error: unknown) {
            if (assistantId !== undefined) {
                updateAssistantMessage(
                    setMessages,
                    assistantId,
                    (message) => ({
                        ...message,
                        createdAt: new Date().toISOString(),
                        retryable: isAbortError(error) || isRetryableChatFailure(error),
                        state: isAbortError(error) ? "aborted" : "error",
                    }),
                );
            }

            if (isAbortError(error)) {
                setRequestError("The response was stopped before completion. You can retry safely.");
            } else {
                handleChatError(error, setPolicy, setRequestError);
            }
        } finally {
            activeRequest.current = undefined;
            requestInFlight.current = false;
            setStreaming(false);
        }
    }, [activeConversation, auth.accessToken, router]);

    const handleRetry = useCallback(async (assistantMessageId: string) => {
        if (requestInFlight.current) {
            return;
        }

        const assistantIndex = messages.findIndex((message) =>
            message.id === assistantMessageId
            && message.role === "assistant"
            && message.retryable === true
            && (message.state === "aborted" || message.state === "error"),
        );
        const prompt = findRetryPrompt(messages, assistantIndex);

        if (!prompt) {
            return;
        }

        await handleSend(prompt, assistantMessageId);
    }, [handleSend, messages]);

    const handleRename = useCallback(async (title: string) => {
        if (!auth.accessToken || !activeConversation) {
            return;
        }

        const response = await updateConversationTitle(
            auth.accessToken,
            activeConversation.conversationId,
            title,
        );

        setActiveConversation(response.data);
        setConversations((current) => current.map((conversation) =>
            conversation.conversationId === response.data.conversationId
                ? response.data
                : conversation,
        ));
    }, [activeConversation, auth.accessToken]);

    async function handleLogout() {
        activeRequest.current?.abort();
        await auth.logout();
        router.replace("/login");
    }

    const roleLabel = auth.context?.role.replaceAll("_", " ") ?? "Member";
    const routingDisplay = getRoutingDisplayState({
        completion,
        policy,
        routing,
        streaming,
    });

    return (
        <WorkspaceShell
            sidebar={<ConversationSidebar
                conversations={conversations}
                status={conversationListStatus}
                activeConversationId={activeConversation?.conversationId ?? initialConversationId}
                user={auth.user}
                roleLabel={roleLabel}
                open={sidebarOpen}
                creating={creating}
                hasMore={conversationNextCursor !== null}
                pageStatus={conversationPageStatus}
                onClose={() => setSidebarOpen(false)}
                onCreate={() => void handleCreate()}
                onLoadMore={() => void handleLoadMoreConversations()}
                onLogout={() => void handleLogout()}
                onRetry={() => {
                    setConversationListStatus("loading");
                    setConversationListReload((current) => current + 1);
                }}
                showAdmin={auth.context?.permissions?.some((permission) =>
                    permission.startsWith("admin:"),
                ) ?? false}
            />}
            main={<ChatCenter
                title={activeConversation?.title ?? "New Conversation"}
                messages={messages}
                retainedMessages={retainedMessages}
                conversationStatus={conversationStatus}
                streaming={streaming}
                routingDisplay={routingDisplay}
                error={requestError}
                hasMoreHistory={messageNextCursor !== null}
                historyPageStatus={messagePageStatus}
                onLoadMoreHistory={() => void handleLoadMoreMessages()}
                onSend={handleSend}
                onRetry={handleRetry}
                onRename={activeConversation ? handleRename : undefined}
                onOpenConversations={() => setSidebarOpen(true)}
                onOpenPolicy={() => setInspectorOpen(true)}
                retentionMode={auth.user?.organisation.retentionMode}
            />}
            inspector={<PolicyInspector
                policy={policy}
                fallback={fallback}
                completion={completion}
                routingDisplay={routingDisplay}
                open={inspectorOpen}
                onClose={() => setInspectorOpen(false)}
            />}
            panelOpen={sidebarOpen || inspectorOpen}
            onDismissPanels={() => {
                setSidebarOpen(false);
                setInspectorOpen(false);
            }}
        />
    );
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}

function isRetryableChatFailure(error: unknown): boolean {
    if (!(error instanceof ApiError)) {
        return true;
    }

    return error.code === "STREAM_INTERRUPTED"
        || error.code === "RATE_LIMITED"
        || error.status >= 500;
}

function findRetryPrompt(
    messages: readonly UiChatMessage[],
    assistantIndex: number,
): string | undefined {
    if (assistantIndex <= 0) {
        return undefined;
    }

    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
        const message = messages[index];

        if (message?.role === "user") {
            return message.content;
        }
    }

    return undefined;
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
    setPolicy: React.Dispatch<React.SetStateAction<PolicyEvent | undefined>>,
    setRequestError: React.Dispatch<React.SetStateAction<string | undefined>>,
) {
    if (error instanceof ApiError && error.code === "POLICY_BLOCKED") {
        const details = policyBlockedDetailsSchema.safeParse(error.details);
        setPolicy({
            action: "BLOCK",
            riskScore: details.success ? details.data.riskScore : 100,
            categories: details.success
                ? details.data.categories.filter((category): category is PolicyEvent["categories"][number] =>
                    [
                        "CONTACT_INFO",
                        "FINANCIAL",
                        "GOVERNMENT_ID",
                        "CREDENTIAL",
                        "INTERNAL_SECRET",
                        "BUSINESS_CONFIDENTIAL",
                    ].includes(category),
                )
                : [],
            masked: false,
        });
        setRequestError("Your organisation policy blocked this request before provider execution.");
        return;
    }

    if (error instanceof ApiError && error.code === "RATE_LIMITED") {
        setRequestError("Chat is temporarily rate limited. Please wait and try again.");
        return;
    }

    setRequestError("The request could not be completed safely. Please try again.");
}
