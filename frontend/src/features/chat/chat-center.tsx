"use client";

import {
    List,
    PaperPlaneTilt,
    ShieldCheck,
    Sparkle,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useState, type FormEvent } from "react";

import { ConversationTitleEditor } from "@/features/conversations/conversation-title-editor";
import type { MessageSummary } from "@/features/conversations/conversation.types";

import { AssistantMarkdown } from "./assistant-markdown";
import type { UiChatMessage } from "./chat.types";

interface ChatCenterProps {
    title: string;
    messages: readonly UiChatMessage[];
    retainedMessages: readonly MessageSummary[];
    conversationStatus: "error" | "idle" | "loading" | "ready";
    streaming: boolean;
    error?: string;
    onSend(prompt: string): Promise<void>;
    onRename?(title: string): Promise<void>;
    onOpenConversations(): void;
    onOpenPolicy?(): void;
}

export function ChatCenter(props: ChatCenterProps) {
    const [prompt, setPrompt] = useState("");
    const unavailableHistoryCount = props.retainedMessages.filter(
        (message) => !message.contentAvailable,
    ).length;
    const composerDisabled =
        props.streaming
        || props.conversationStatus === "loading"
        || props.conversationStatus === "error";

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = prompt;

        if (value.trim().length === 0 || props.streaming) {
            return;
        }

        setPrompt("");
        await props.onSend(value);
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
                            openai/gpt-oss-20b
                        </span>
                        <span className="inline-flex min-h-9 items-center gap-2 rounded-[9px] border border-border-default px-3 text-xs text-[#303632] max-[720px]:hidden">
                            <i className="size-[7px] rounded-full bg-brand" /> Online
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

            <section className="min-h-0 overflow-y-auto px-8 pt-[30px] pb-6 max-[720px]:px-3.5 max-[720px]:py-[18px]" aria-live="polite">
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
                ) : props.messages.length === 0 ? (
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
                ) : props.messages.map((message) => (
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
                            {message.state === "error" ? (
                                <span className="mt-3 inline-block text-[11px] font-semibold text-danger">Response interrupted</span>
                            ) : null}
                        </div>
                    </article>
                ))}
            </section>

            <div className="px-8 pb-[26px] max-[720px]:px-3 max-[720px]:pb-[calc(12px+env(safe-area-inset-bottom))]">
                {props.error ? (
                    <p className="mx-auto mt-0 mb-2.5 max-w-205 rounded-[9px] bg-danger-soft px-[13px] py-2.5 text-xs text-danger" role="alert">
                        {props.error}
                    </p>
                ) : null}
                <form className="mx-auto grid max-w-205 rounded-[15px] border border-border-strong bg-surface pt-3.5 pr-3.5 pb-3 pl-[18px] shadow-soft focus-within:border-brand/70" onSubmit={handleSubmit}>
                    <textarea
                        className="min-h-17.5 w-full resize-none border-0 text-text-primary outline-0 placeholder:text-text-faint max-[720px]:min-h-[55px]"
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="Type your message…"
                        aria-label="Message"
                        rows={3}
                        maxLength={20_000}
                        disabled={composerDisabled}
                    />
                    <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-[7px] text-[11px] text-text-faint">
                            <ShieldCheck size={18} /> Policy protected
                        </span>
                        <button
                            className="grid size-11 cursor-pointer place-items-center rounded-[10px] bg-brand text-white disabled:cursor-not-allowed disabled:opacity-45"
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
