"use client";

import { Check, PencilSimple, X } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";

interface ConversationTitleEditorProps {
    title: string;
    onRename(title: string): Promise<void>;
}

export function ConversationTitleEditor(
    props: Readonly<ConversationTitleEditorProps>,
) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(props.title);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string>();
    const normalizedTitle = draft.trim();
    const valid = normalizedTitle.length >= 1 && normalizedTitle.length <= 120;

    function beginEditing() {
        setDraft(props.title);
        setError(undefined);
        setEditing(true);
    }

    function cancelEditing() {
        setDraft(props.title);
        setError(undefined);
        setEditing(false);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!valid || saving) {
            return;
        }

        setSaving(true);
        setError(undefined);

        try {
            await props.onRename(normalizedTitle);
            setEditing(false);
        } catch {
            setError("Conversation title could not be updated.");
        } finally {
            setSaving(false);
        }
    }

    if (!editing) {
        return (
            <div className="flex min-w-0 items-center gap-2">
                <h1 className="m-0 overflow-hidden text-[clamp(20px,2vw,25px)] font-bold tracking-[-0.035em] text-ellipsis whitespace-nowrap max-[720px]:text-[17px]">
                    {props.title}
                </h1>
                <button
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-text-soft hover:bg-surface-soft hover:text-text-primary"
                    type="button"
                    onClick={beginEditing}
                    aria-label="Rename conversation"
                >
                    <PencilSimple size={17} />
                </button>
            </div>
        );
    }

    return (
        <form className="grid min-w-0 gap-1" onSubmit={handleSubmit}>
            <div className="flex min-w-0 items-center gap-2">
                <input
                    className="min-w-0 flex-1 rounded-lg border border-border-strong px-3 py-2 text-base font-semibold outline-none focus:border-brand"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={120}
                    aria-label="Conversation title"
                    autoFocus
                />
                <button
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white disabled:opacity-45"
                    type="submit"
                    disabled={!valid || saving}
                    aria-label="Save conversation title"
                >
                    <Check size={17} />
                </button>
                <button
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-soft text-text-soft"
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                    aria-label="Cancel conversation rename"
                >
                    <X size={17} />
                </button>
            </div>
            {error ? <span className="text-[11px] text-danger" role="alert">{error}</span> : null}
        </form>
    );
}
