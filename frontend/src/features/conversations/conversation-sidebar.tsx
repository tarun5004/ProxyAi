"use client";

import {
    CaretDown,
    ChatCircleDots,
    MagnifyingGlass,
    Plus,
    SignOut,
    X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BrandLogo } from "@/components/layout/brand-logo";

import type { LoginUser } from "@/features/auth/auth.types";
import type { ConversationSummary } from "./conversation.types";

interface ConversationSidebarProps {
    conversations: readonly ConversationSummary[];
    activeConversationId?: string;
    user?: LoginUser;
    roleLabel: string;
    open: boolean;
    creating: boolean;
    onClose(): void;
    onCreate(): void;
    onLogout(): void;
}

export function ConversationSidebar(props: ConversationSidebarProps) {
    const [query, setQuery] = useState("");
    const filteredConversations = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return normalizedQuery.length === 0
            ? props.conversations
            : props.conversations.filter((conversation) =>
                conversation.title.toLowerCase().includes(normalizedQuery),
            );
    }, [props.conversations, query]);
    const displayName = props.user?.displayName ?? "ProxyAi User";
    const organisationName = props.user?.organisation.name ?? "Your workspace";
    const initials = displayName
        .split(/\s+/u)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");

    return (
        <aside className={`flex min-w-0 flex-col border-r border-border-default bg-surface px-6 pt-7 pb-[22px] max-[1100px]:fixed max-[1100px]:inset-y-0 max-[1100px]:left-0 max-[1100px]:z-40 max-[1100px]:w-[min(88vw,340px)] max-[1100px]:-translate-x-[105%] max-[1100px]:shadow-[18px_0_48px_rgb(8_22_14_/_12%)] max-[1100px]:transition-transform max-[1100px]:duration-200 ${props.open ? "max-[1100px]:translate-x-0" : ""}`}>
            <div className="flex min-h-12 items-center justify-between">
                <BrandLogo compact />
                <button
                    className="hidden size-[38px] place-items-center rounded-[9px] bg-surface-soft text-text-primary max-[1100px]:grid"
                    onClick={props.onClose}
                    aria-label="Close conversations"
                >
                    <X size={20} />
                </button>
            </div>

            <button
                className="mt-[22px] flex min-h-[50px] cursor-pointer items-center justify-center gap-[9px] rounded-[10px] bg-brand text-sm font-semibold text-white hover:not-disabled:bg-brand-dark disabled:cursor-wait disabled:opacity-70"
                onClick={props.onCreate}
                disabled={props.creating}
            >
                <Plus size={19} />
                {props.creating ? "Creating…" : "New Conversation"}
            </button>

            <label className="mt-5 flex min-h-[47px] items-center gap-2.5 rounded-[10px] border border-border-default px-3.5 text-text-soft focus-within:border-brand">
                <MagnifyingGlass size={18} />
                <input
                    className="min-w-0 flex-1 border-0 text-[13px] text-text-primary outline-0"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search conversations…"
                    aria-label="Search conversations"
                />
            </label>

            <nav
                className="mt-5 grid min-h-0 flex-1 content-start gap-[7px] overflow-y-auto pr-0.5"
                aria-label="Conversations"
            >
                {filteredConversations.length === 0 ? (
                    <p className="mx-2 my-5 text-[13px] text-text-faint">
                        No conversations found.
                    </p>
                ) : filteredConversations.map((conversation) => (
                    <Link
                        key={conversation.conversationId}
                        href={`/chat/${conversation.conversationId}`}
                        className={`grid min-h-[52px] grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-[9px] rounded-[10px] px-3 py-2 text-[13px] text-[#252a27] hover:bg-surface-green hover:text-brand-dark ${
                            conversation.conversationId === props.activeConversationId
                                ? "bg-surface-green text-brand-dark"
                                : ""
                        }`}
                        onClick={props.onClose}
                    >
                        <ChatCircleDots size={18} />
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                            {conversation.title}
                        </span>
                        <time className="text-[11px] text-text-faint">
                            {formatConversationTime(conversation.lastMessageAt)}
                        </time>
                    </Link>
                ))}
            </nav>

            <div className="overflow-hidden rounded-xl border border-border-default">
                <div className="flex items-center justify-between gap-3 border-b border-border-default p-3.5">
                    <div className="grid min-w-0 gap-[3px]">
                        <span className="text-[10px] text-text-faint">Current Workspace</span>
                        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                            {organisationName}
                        </strong>
                    </div>
                    <CaretDown size={16} />
                </div>
                <div className="grid grid-cols-[38px_minmax(0,1fr)_32px] items-center justify-between gap-3 p-3.5">
                    <span className="grid size-[38px] place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark">
                        {initials || "PA"}
                    </span>
                    <div className="grid min-w-0 gap-[3px]">
                        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                            {displayName}
                        </strong>
                        <span className="text-[10px] text-text-faint">{props.roleLabel}</span>
                    </div>
                    <button
                        className="grid size-8 cursor-pointer place-items-center rounded-lg bg-transparent text-text-soft hover:bg-surface-soft hover:text-text-primary"
                        onClick={props.onLogout}
                        aria-label="Sign out"
                        title="Sign out"
                    >
                        <SignOut size={18} />
                    </button>
                </div>
            </div>
        </aside>
    );
}

function formatConversationTime(value: string | null): string {
    if (!value) {
        return "New";
    }

    const date = new Date(value);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
        return new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
        }).format(date);
    }

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
    }).format(date);
}
