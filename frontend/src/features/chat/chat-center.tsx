"use client";

import {
    ArrowDown,
    ArrowClockwise,
    Copy,
    List,
    PaperPlaneTilt,
    ShieldCheck,
    Sparkle,
} from "@phosphor-icons/react";
import Image from "next/image";
import {
    useLayoutEffect,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
    type UIEvent,
} from "react";

import { ConversationTitleEditor } from "@/features/conversations/conversation-title-editor";
import type { MessageSummary } from "@/features/conversations/conversation.types";
import type { RoutingDisplayState } from "@/features/policy/routing-display";

import { AssistantMarkdown } from "./assistant-markdown";
import type { UiChatMessage } from "./chat.types";
import { RetentionIndicator } from "./retention-indicator";
import type { RetentionMode } from "@/features/auth/auth.types";

const NEAR_BOTTOM_DISTANCE_PX = 96;
const ROUTING_STATUS_LABELS: Record<RoutingDisplayState["status"], string> = {
    BLOCKED: "Blocked",
    NOT_ROUTED: "Not routed",
    PENDING: "Pending",
    ROUTED: "Routed",
    ROUTING: "Routing",
};

interface ChatCenterProps {
    title: string;
    messages: readonly UiChatMessage[];
    retainedMessages: readonly MessageSummary[];
    conversationStatus: "error" | "idle" | "loading" | "ready";
    routingDisplay: RoutingDisplayState;
    streaming: boolean;
    error?: string;
    hasMoreHistory: boolean;
    historyPageStatus: "error" | "idle" | "loading";
    onLoadMoreHistory(): void;
    onSend(prompt: string): Promise<void>;
    onRetry?(assistantMessageId: string): Promise<void>;
    onRename?(title: string): Promise<void>;
    onOpenConversations(): void;
    onOpenPolicy?(): void;
    retentionMode?: RetentionMode;
}

export function ChatCenter(props: ChatCenterProps) {
    const [prompt, setPrompt] = useState("");
    const [copyFeedback, setCopyFeedback] = useState<{
        messageId: string;
        status: "error" | "success";
    }>();
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const messageViewportRef = useRef<HTMLElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const submitting = useRef(false);
    const shouldAutoFollow = useRef(true);
    const wasStreaming = useRef(props.streaming);
    const unavailableHistoryCount = props.retainedMessages.filter(
        (message) => !message.contentAvailable,
    ).length;
    const composerDisabled =
        props.streaming
        || props.conversationStatus === "loading"
        || props.conversationStatus === "error";

    useLayoutEffect(() => {
        const streamJustFinished = wasStreaming.current && !props.streaming;

        if ((props.streaming || streamJustFinished) && shouldAutoFollow.current) {
            scrollToLatest(messageViewportRef.current, "auto");
        }

        wasStreaming.current = props.streaming;
    }, [props.messages, props.streaming]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        await submitPrompt();
    }

    async function submitPrompt() {
        const value = prompt;

        if (value.trim().length === 0 || composerDisabled || submitting.current) {
            return;
        }

        submitting.current = true;
        setPrompt("");

        try {
            await props.onSend(value);
        } finally {
            submitting.current = false;
            textareaRef.current?.focus();
        }
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (
            event.key !== "Enter"
            || event.shiftKey
            || event.repeat
            || event.nativeEvent.isComposing
        ) {
            return;
        }

        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
    }

    function handleMessageScroll(event: UIEvent<HTMLElement>) {
        const nearBottom = isNearBottom(event.currentTarget);

        shouldAutoFollow.current = nearBottom;
        setShowJumpToLatest(!nearBottom);
    }

    function handleJumpToLatest() {
        shouldAutoFollow.current = true;
        setShowJumpToLatest(false);
        scrollToLatest(messageViewportRef.current, "smooth");
    }

    async function handleCopy(messageId: string, content: string) {
        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error("Clipboard unavailable");
            }

            await navigator.clipboard.writeText(content);
            setCopyFeedback({ messageId, status: "success" });
        } catch {
            setCopyFeedback({ messageId, status: "error" });
        }
    }

    return (
        <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-surface">
            <header className="grid min-h-32 grid-cols-1 items-start border-b border-border-default px-8 pt-7 pb-5 max-[1280px]:grid-cols-[44px_minmax(0,1fr)_44px] max-[1280px]:gap-3.5 max-[720px]:min-h-[104px] max-[720px]:p-4">
                <button
                    className="hidden size-10 place-items-center rounded-[10px] bg-surface-soft text-text-primary max-[1100px]:grid"
                    onClick={props.onOpenConversations}
                    aria-label="Open conversations"
                >
                    <List size={21} />
                </button>
                <div className="grid gap-4 max-[720px]:gap-[9px]">
                    {props.onRename ? (
                        <ConversationTitleEditor
                            title={props.title}
                            onRename={props.onRename}
                        />
                    ) : (
                        <h1 className="m-0 overflow-hidden text-[clamp(20px,2vw,25px)] font-bold tracking-[-0.035em] text-ellipsis whitespace-nowrap max-[720px]:text-[17px]">
                            {props.title}
                        </h1>
                    )}
                    <div className="flex items-center gap-2.5">
                        <span className="inline-flex min-h-9 items-center rounded-[9px] border border-border-default px-3 text-xs text-[#303632] max-[720px]:min-h-[30px] max-[720px]:max-w-45 max-[720px]:overflow-hidden max-[720px]:px-[9px] max-[720px]:text-ellipsis max-[720px]:whitespace-nowrap">
                            {props.routingDisplay.model}
                        </span>
                        <span className="inline-flex min-h-9 items-center gap-2 rounded-[9px] border border-border-default px-3 text-xs text-[#303632] max-[720px]:hidden">
                            <i className={`size-[7px] rounded-full ${routingStatusDotClass(props.routingDisplay.status)}`} />
                            {formatRoutingStatus(props.routingDisplay.status)}
                        </span>
                    </div>
                </div>
                {props.onOpenPolicy ? (
                    <button
                        className="hidden size-10 place-items-center rounded-[10px] bg-surface-soft text-text-primary max-[1280px]:grid"
                        onClick={props.onOpenPolicy}
                        aria-label="Open policy inspector"
                    >
                        <ShieldCheck size={21} />
                    </button>
                ) : null}
            </header>

            <div className="relative min-h-0">
                <section
                    ref={messageViewportRef}
                    className="h-full min-h-0 overflow-y-auto px-8 pt-[30px] pb-20 max-[720px]:px-3.5 max-[720px]:pt-[18px] max-[720px]:pb-18"
                    aria-label="Conversation messages"
                    aria-live="polite"
                    onScroll={handleMessageScroll}
                >
                {unavailableHistoryCount > 0 ? (
                    <div className="mx-auto mb-5 max-w-190 rounded-[10px] border border-border-default bg-surface-soft px-3.5 py-[11px] text-xs leading-6 text-text-soft">
                        {unavailableHistoryCount} previous message {unavailableHistoryCount === 1 ? "summary is" : "summaries are"} retained. Content is unavailable under the current retention mode.
                    </div>
                ) : null}

                {props.conversationStatus === "loading" ? (
                    <div className="mx-auto grid min-h-full max-w-117.5 content-center justify-items-center text-center" role="status">
                        <span className="text-sm font-semibold text-text-soft">Loading conversation…</span>
                    </div>
                ) : props.conversationStatus === "error" ? (
                    <div className="mx-auto grid min-h-full max-w-117.5 content-center justify-items-center text-center" role="alert">
                        <h2 className="mb-2 text-xl font-bold">Conversation unavailable</h2>
                        <p className="m-0 text-sm leading-[1.65] text-text-soft">
                            This conversation could not be loaded.
                        </p>
                    </div>
                ) : props.messages.length === 0 && props.retainedMessages.length === 0 ? (
                    <div className="mx-auto grid min-h-full max-w-117.5 content-center justify-items-center text-center">
                        <span className="grid size-13 place-items-center rounded-2xl bg-brand-soft text-brand">
                            <Sparkle size={25} weight="fill" />
                        </span>
                        <h2 className="mt-[18px] mb-2 text-[22px] font-bold tracking-[-0.03em]">
                            Start a secure conversation
                        </h2>
                        <p className="m-0 text-sm leading-[1.65] text-text-soft">
                            Your prompt is evaluated by organisation policy before it reaches the configured provider.
                        </p>
                    </div>
                ) : <>
                    {props.retainedMessages.filter((message) => message.contentAvailable).map((message) => (
                        <RetainedMessage
                            key={message.messageId}
                            message={message}
                            copyStatus={copyFeedback?.messageId === message.messageId
                                ? copyFeedback.status
                                : undefined}
                            onCopy={handleCopy}
                        />
                    ))}
                    {props.hasMoreHistory ? (
                        <div className="mx-auto mb-5 grid max-w-205 justify-items-center gap-2">
                            <button
                                className="rounded-lg border border-border-default bg-white px-4 py-2 text-xs font-semibold text-brand-dark disabled:cursor-wait disabled:opacity-60"
                                type="button"
                                onClick={props.onLoadMoreHistory}
                                disabled={props.historyPageStatus === "loading"}
                            >
                                {props.historyPageStatus === "loading" ? "Loading history…" : "Load more history"}
                            </button>
                            {props.historyPageStatus === "error" ? (
                                <span className="text-xs text-danger" role="alert">
                                    More message history could not be loaded. Try again.
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    {props.messages.map((message) => (
                    <article
                        key={message.id}
                        className={`mx-auto mb-[22px] grid max-w-205 grid-cols-[48px_minmax(0,1fr)] gap-3.5 rounded-[15px] border border-border-default p-[21px] max-[720px]:mb-3.5 max-[720px]:grid-cols-[38px_minmax(0,1fr)] max-[720px]:gap-2.5 max-[720px]:rounded-xl max-[720px]:p-[15px] ${message.role === "user" ? "bg-surface-green" : "bg-surface shadow-panel"}`}
                    >
                        {message.role === "user" ? (
                            <span className="grid size-10 place-items-center rounded-full bg-brand text-[10px] font-bold text-white max-[720px]:size-[34px]">
                                YOU
                            </span>
                        ) : (
                            <span className="flex size-10 items-center overflow-hidden rounded-full bg-surface-soft max-[720px]:size-[34px]">
                                <Image
                                    className="h-auto w-40 max-w-none shrink-0 max-[720px]:w-34"
                                    src="/proxiai-logo.png"
                                    alt="ProxyAi"
                                    width={360}
                                    height={90}
                                />
                            </span>
                        )}
                        <div className="min-w-0">
                            <div className="mt-[7px] text-sm text-[#222724] max-[720px]:mt-[3px] max-[720px]:text-[13px]">
                                {message.role === "assistant" ? (
                                    <AssistantMarkdown
                                        content={message.content || (message.state === "streaming" ? "Thinking…" : "")}
                                    />
                                ) : (
                                    <p className="m-0 wrap-anywhere whitespace-pre-wrap leading-[1.7]">
                                        {message.content}
                                    </p>
                                )}
                            </div>
                            {message.state === "streaming" ? (
                                <span className="mt-3 inline-block text-[11px] font-semibold text-brand">Streaming</span>
                            ) : null}
                            {message.state === "error" || message.state === "aborted" ? (
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                    <span className="text-[11px] font-semibold text-danger">
                                        {message.state === "aborted" ? "Response stopped" : "Response interrupted"}
                                    </span>
                                    {message.retryable && props.onRetry && !props.streaming ? (
                                        <button
                                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-default px-3 text-[11px] font-semibold text-text-primary hover:border-brand/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                            type="button"
                                            onClick={() => void props.onRetry?.(message.id)}
                                            aria-label="Retry response"
                                        >
                                            <ArrowClockwise size={15} aria-hidden="true" />
                                            Retry
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-default/70 pt-2.5">
                                <MessageTimestamp
                                    value={message.createdAt}
                                    role={message.role}
                                    source="session"
                                />
                                {message.content.length > 0 && message.state !== "streaming" ? (
                                    <CopyAction
                                        role={message.role}
                                        status={copyFeedback?.messageId === message.id
                                            ? copyFeedback.status
                                            : undefined}
                                        onCopy={() => void handleCopy(message.id, message.content)}
                                    />
                                ) : null}
                            </div>
                        </div>
                    </article>
                    ))}
                </>}
                </section>
                {showJumpToLatest ? (
                    <button
                        type="button"
                        className="absolute bottom-4 left-1/2 z-10 inline-flex min-h-10 -translate-x-1/2 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-xs font-semibold text-text-primary shadow-panel transition-colors hover:border-brand/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-[720px]:bottom-3 max-[720px]:min-h-11 max-[720px]:px-3.5"
                        onClick={handleJumpToLatest}
                        aria-label="Jump to latest message"
                    >
                        <ArrowDown size={16} aria-hidden="true" />
                        Jump to latest
                    </button>
                ) : null}
            </div>

            <div className="px-8 pb-[26px] max-[720px]:px-3 max-[720px]:pb-[calc(12px+env(safe-area-inset-bottom))]">
                {props.error ? (
                    <p className="mx-auto mt-0 mb-2.5 max-w-205 rounded-[9px] bg-danger-soft px-[13px] py-2.5 text-xs text-danger" role="alert">
                        {props.error}
                    </p>
                ) : null}
                <form className="mx-auto grid max-w-205 rounded-[15px] border border-border-strong bg-surface pt-3.5 pr-3.5 pb-3 pl-[18px] shadow-soft focus-within:border-brand/70" onSubmit={handleSubmit}>
                    <textarea
                        ref={textareaRef}
                        className="min-h-17.5 w-full resize-none border-0 text-text-primary outline-0 placeholder:text-text-faint max-[720px]:min-h-[55px]"
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message…"
                        aria-label="Message"
                        rows={3}
                        maxLength={20_000}
                        disabled={composerDisabled}
                    />
                    <div className="flex items-center justify-between">
                        {props.retentionMode ? (
                            <RetentionIndicator mode={props.retentionMode} />
                        ) : (
                            <span className="inline-flex items-center gap-[7px] text-[11px] text-text-faint">
                                <ShieldCheck size={18} /> Policy protected
                            </span>
                        )}
                        <button
                            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-[10px] bg-brand text-white disabled:cursor-not-allowed disabled:opacity-45"
                            type="submit"
                            disabled={composerDisabled || prompt.trim().length === 0}
                            aria-label="Send message"
                        >
                            <PaperPlaneTilt size={20} weight="fill" />
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}

function isNearBottom(element: HTMLElement) {
    return element.scrollHeight - element.scrollTop - element.clientHeight
        <= NEAR_BOTTOM_DISTANCE_PX;
}

function formatRoutingStatus(status: RoutingDisplayState["status"]): string {
    return ROUTING_STATUS_LABELS[status];
}

function routingStatusDotClass(status: RoutingDisplayState["status"]): string {
    if (status === "BLOCKED") {
        return "bg-danger";
    }

    if (status === "ROUTING" || status === "ROUTED") {
        return "bg-brand";
    }

    return "bg-text-faint";
}

function scrollToLatest(
    element: HTMLElement | null,
    behavior: ScrollBehavior,
) {
    if (!element) {
        return;
    }

    if (typeof element.scrollTo !== "function") {
        element.scrollTop = element.scrollHeight;
        return;
    }

    element.scrollTo({
        behavior,
        top: element.scrollHeight,
    });
}

function RetainedMessage({
    message,
    copyStatus,
    onCopy,
}: Readonly<{
    message: MessageSummary;
    copyStatus?: "error" | "success";
    onCopy(messageId: string, content: string): Promise<void>;
}>) {
    const assistant = message.role === "assistant";

    return (
        <article className={`mx-auto mb-[22px] grid max-w-205 grid-cols-[48px_minmax(0,1fr)] gap-3.5 rounded-[15px] border border-border-default p-[21px] max-[720px]:mb-3.5 max-[720px]:grid-cols-[38px_minmax(0,1fr)] max-[720px]:gap-2.5 max-[720px]:rounded-xl max-[720px]:p-[15px] ${assistant ? "bg-surface shadow-panel" : "bg-surface-green"}`}>
            {assistant ? (
                <span className="flex size-10 items-center overflow-hidden rounded-full bg-surface-soft max-[720px]:size-[34px]">
                    <Image className="h-auto w-40 max-w-none shrink-0 max-[720px]:w-34" src="/proxiai-logo.png" alt="ProxyAi" width={360} height={90} />
                </span>
            ) : (
                <span className="grid size-10 place-items-center rounded-full bg-brand text-[10px] font-bold text-white max-[720px]:size-[34px]">
                    {message.role === "system" ? "SYS" : "YOU"}
                </span>
            )}
            <div className="min-w-0">
                <div className="mt-[7px] text-sm text-[#222724] max-[720px]:mt-[3px] max-[720px]:text-[13px]">
                    {assistant ? (
                        <AssistantMarkdown content={message.content ?? ""} />
                    ) : (
                        <p className="m-0 wrap-anywhere whitespace-pre-wrap leading-[1.7]">{message.content}</p>
                    )}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-default/70 pt-2.5">
                    <MessageTimestamp
                        value={message.createdAt}
                        role={message.role}
                        source="authoritative"
                    />
                    {message.role !== "system" && message.content ? (
                        <CopyAction
                            role={message.role}
                            status={copyStatus}
                            onCopy={() => void onCopy(message.messageId, message.content!)}
                        />
                    ) : null}
                </div>
            </div>
        </article>
    );
}

function CopyAction({
    role,
    status,
    onCopy,
}: Readonly<{
    role: "assistant" | "user";
    status?: "error" | "success";
    onCopy(): void;
}>) {
    return (
        <div className="flex min-h-9 items-center gap-2">
            {status ? (
                <span
                    className={`text-[11px] font-medium ${status === "success" ? "text-brand-dark" : "text-danger"}`}
                    role="status"
                >
                    {status === "success" ? "Copied" : "Copy failed"}
                </span>
            ) : null}
            <button
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-text-soft hover:bg-surface-soft hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                type="button"
                onClick={onCopy}
                aria-label={`Copy ${role} message`}
            >
                <Copy size={15} aria-hidden="true" />
                Copy
            </button>
        </div>
    );
}

function MessageTimestamp({
    value,
    role,
    source,
}: Readonly<{
    value?: string;
    role: "assistant" | "system" | "user";
    source: "authoritative" | "session";
}>) {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const shortTime = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
    const fullTime = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
    const sourceLabel = source === "session" ? "Session" : "Recorded";

    return (
        <time
            className="text-[11px] text-text-faint"
            dateTime={value}
            title={source === "session" ? "Local session time; not persisted" : fullTime}
            aria-label={`${sourceLabel} time for ${role} message: ${fullTime}`}
            suppressHydrationWarning
        >
            {shortTime}{source === "session" ? " · session" : ""}
        </time>
    );
}
