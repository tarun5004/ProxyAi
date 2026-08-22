"use client";

import { Warning } from "@phosphor-icons/react";
import {
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";

export interface AdminMutationChange {
    label: string;
    before: string;
    after: string;
}

export interface AdminMutationConfirmation {
    title: string;
    target: string;
    consequence: string;
    changes: readonly AdminMutationChange[];
    confirmLabel: string;
}

interface ConfirmationDialogProps {
    confirmation: AdminMutationConfirmation;
    working: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

function ConfirmationDialog({
    confirmation,
    working,
    onCancel,
    onConfirm,
}: Readonly<ConfirmationDialogProps>) {
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();
    const consequenceId = useId();

    useEffect(() => {
        cancelButtonRef.current?.focus();

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape" && !working) {
                onCancel();
            }
        }

        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [onCancel, working]);

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation">
            <section
                aria-describedby={consequenceId}
                aria-labelledby={titleId}
                aria-modal="true"
                className="w-full max-w-lg rounded-2xl border border-border-default bg-white p-6 shadow-2xl"
                role="dialog"
            >
                <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#fff3dc] text-[#98620a]">
                        <Warning aria-hidden size={21} weight="fill" />
                    </span>
                    <div>
                        <h2 className="m-0 text-lg font-semibold" id={titleId}>{confirmation.title}</h2>
                        <p className="mt-1 mb-0 text-sm text-text-soft">Review this privileged change before it is applied.</p>
                    </div>
                </div>

                <div className="mt-5 rounded-xl border border-border-soft bg-surface-soft p-4">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint">Target</span>
                    <strong className="mt-1 block break-words text-sm">{confirmation.target}</strong>
                </div>

                <dl className="mt-4 grid gap-3">
                    {confirmation.changes.map((change) => (
                        <div className="grid gap-2 rounded-xl border border-border-soft p-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center" key={change.label}>
                            <div>
                                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">{change.label} before</dt>
                                <dd className="m-0 mt-1 break-words text-sm text-text-soft">{change.before}</dd>
                            </div>
                            <span aria-hidden className="hidden text-text-faint sm:block">→</span>
                            <div>
                                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">{change.label} after</dt>
                                <dd className="m-0 mt-1 break-words text-sm font-semibold">{change.after}</dd>
                            </div>
                        </div>
                    ))}
                </dl>

                <p className="mt-4 mb-0 rounded-xl border border-[#f2c56d] bg-[#fff9e9] p-4 text-sm leading-6 text-[#77530b]" id={consequenceId}>
                    <strong className="block">Consequence</strong>
                    {confirmation.consequence}
                </p>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        className="rounded-lg border border-border-default bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                        disabled={working}
                        onClick={onCancel}
                        ref={cancelButtonRef}
                        type="button"
                    >
                        Cancel
                    </button>
                    <button
                        className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                        disabled={working}
                        onClick={onConfirm}
                        type="button"
                    >
                        {working ? "Applying…" : confirmation.confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    );
}

type MutationState = "idle" | "working" | "error";

export function ConfirmedMutationButton({
    label,
    confirmation,
    run,
    onDone,
    disabled = false,
}: Readonly<{
    label: string;
    confirmation: AdminMutationConfirmation;
    run: () => Promise<unknown>;
    onDone?: () => void;
    disabled?: boolean;
}>) {
    const [open, setOpen] = useState(false);
    const [state, setState] = useState<MutationState>("idle");
    const inFlightRef = useRef(false);

    async function confirm() {
        if (inFlightRef.current) return;

        inFlightRef.current = true;
        setState("working");
        try {
            await run();
            setState("idle");
            setOpen(false);
            onDone?.();
        } catch {
            setState("error");
            setOpen(false);
        } finally {
            inFlightRef.current = false;
        }
    }

    return (
        <>
            <span className="grid gap-1">
                <button
                    className="rounded-lg border border-border-default bg-white px-3 py-2 text-xs font-semibold disabled:opacity-60"
                    disabled={disabled || state === "working"}
                    onClick={() => {
                        setState("idle");
                        setOpen(true);
                    }}
                    type="button"
                >
                    {state === "working" ? "Saving…" : state === "error" ? "Retry" : label}
                </button>
                {state === "error" ? <span className="text-[10px] text-danger" role="alert">Update failed</span> : null}
            </span>
            {open ? (
                <ConfirmationDialog
                    confirmation={confirmation}
                    onCancel={() => setOpen(false)}
                    onConfirm={() => void confirm()}
                    working={state === "working"}
                />
            ) : null}
        </>
    );
}

export function ConfirmedMutationSelect({
    ariaLabel,
    value,
    getConfirmation,
    run,
    onDone,
    children,
}: Readonly<{
    ariaLabel: string;
    value: string;
    getConfirmation: (nextValue: string) => AdminMutationConfirmation;
    run: (value: string) => Promise<unknown>;
    onDone: () => void;
    children: ReactNode;
}>) {
    const [pendingValue, setPendingValue] = useState<string>();
    const [state, setState] = useState<MutationState>("idle");
    const inFlightRef = useRef(false);

    async function confirm() {
        if (pendingValue === undefined || inFlightRef.current) return;

        inFlightRef.current = true;
        setState("working");
        try {
            await run(pendingValue);
            setState("idle");
            setPendingValue(undefined);
            onDone();
        } catch {
            setState("error");
            setPendingValue(undefined);
        } finally {
            inFlightRef.current = false;
        }
    }

    return (
        <>
            <span className="grid gap-1">
                <select
                    aria-label={ariaLabel}
                    className="rounded-lg border border-border-default px-2 py-1.5 text-xs disabled:opacity-60"
                    disabled={state === "working"}
                    onChange={(event) => {
                        if (event.target.value === value) return;
                        setState("idle");
                        setPendingValue(event.target.value);
                    }}
                    value={value}
                >
                    {children}
                </select>
                {state === "error" ? <span className="text-[10px] text-danger" role="alert">Update failed</span> : null}
            </span>
            {pendingValue !== undefined ? (
                <ConfirmationDialog
                    confirmation={getConfirmation(pendingValue)}
                    onCancel={() => setPendingValue(undefined)}
                    onConfirm={() => void confirm()}
                    working={state === "working"}
                />
            ) : null}
        </>
    );
}
