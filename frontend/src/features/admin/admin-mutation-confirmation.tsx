"use client";

import { Warning } from "@phosphor-icons/react";
import {
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";

import { ApiError } from "@/lib/errors/api-error";

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

export type AdminActionState = "idle" | "working" | "success" | "error" | "refresh-error";
type WorkingMode = "mutation" | "refresh";

export function getSafeAdminFailureMessage(error: unknown): string {
    if (!(error instanceof ApiError)) {
        return "The change could not be confirmed. Refresh and try again.";
    }

    if (error.status === 400 || error.status === 422) {
        return "The change was rejected. Review the values and try again.";
    }
    if (error.status === 401) {
        return "Your session could not authorize this change. Sign in again if retry fails.";
    }
    if (error.status === 403) {
        return "Your current permissions do not allow this change.";
    }
    if (error.status === 404) {
        return "The target is no longer available. Refresh and try again.";
    }
    if (error.status === 409) {
        return "The record changed before this update completed. Refresh and try again.";
    }
    if (error.status >= 500) {
        return "The service is temporarily unavailable. No change was confirmed.";
    }

    return "The change could not be confirmed. Refresh and try again.";
}

export function AdminActionFeedback({ state, successMessage, failureMessage }: Readonly<{
    state: AdminActionState;
    successMessage: string;
    failureMessage?: string;
}>) {
    if (state === "success") {
        return <span className="text-[10px] text-brand" role="status">{successMessage}</span>;
    }
    if (state === "refresh-error") {
        return <span className="text-[10px] text-danger" role="alert">Change accepted, but current values could not be verified. Retry this section.</span>;
    }
    if (state === "error") {
        return <span className="text-[10px] text-danger" role="alert">{failureMessage}</span>;
    }
    return null;
}

export function ConfirmedMutationButton({
    label,
    confirmation,
    run,
    onDone,
    successMessage = "Change saved and verified.",
    disabled = false,
}: Readonly<{
    label: string;
    confirmation: AdminMutationConfirmation;
    run: () => Promise<unknown>;
    onDone?: () => Promise<void> | void;
    successMessage?: string;
    disabled?: boolean;
}>) {
    const [open, setOpen] = useState(false);
    const [state, setState] = useState<AdminActionState>("idle");
    const [failureMessage, setFailureMessage] = useState<string>();
    const [workingMode, setWorkingMode] = useState<WorkingMode>("mutation");
    const inFlightRef = useRef(false);

    async function refreshAuthoritativeValues() {
        if (!onDone || inFlightRef.current) return;

        inFlightRef.current = true;
        setWorkingMode("refresh");
        setState("working");
        try {
            await onDone();
            setState("success");
        } catch {
            setState("refresh-error");
        } finally {
            inFlightRef.current = false;
        }
    }

    async function confirm() {
        if (inFlightRef.current) return;

        inFlightRef.current = true;
        setWorkingMode("mutation");
        setState("working");
        setFailureMessage(undefined);
        try {
            await run();
            setOpen(false);
            try {
                setWorkingMode("refresh");
                await onDone?.();
                setState("success");
            } catch {
                setState("refresh-error");
            }
        } catch (error: unknown) {
            setFailureMessage(getSafeAdminFailureMessage(error));
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
                        if (state === "refresh-error") {
                            void refreshAuthoritativeValues();
                            return;
                        }
                        setState("idle");
                        setFailureMessage(undefined);
                        setOpen(true);
                    }}
                    type="button"
                >
                    {state === "working" ? (workingMode === "refresh" ? "Refreshing…" : "Saving…") : state === "refresh-error" ? "Refresh" : state === "error" ? "Retry" : label}
                </button>
                <AdminActionFeedback state={state} successMessage={successMessage} failureMessage={failureMessage} />
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
    successMessage = "Change saved and verified.",
    children,
}: Readonly<{
    ariaLabel: string;
    value: string;
    getConfirmation: (nextValue: string) => AdminMutationConfirmation;
    run: (value: string) => Promise<unknown>;
    onDone: () => Promise<void> | void;
    successMessage?: string;
    children: ReactNode;
}>) {
    const [pendingValue, setPendingValue] = useState<string>();
    const [state, setState] = useState<AdminActionState>("idle");
    const [failureMessage, setFailureMessage] = useState<string>();
    const [workingMode, setWorkingMode] = useState<WorkingMode>("mutation");
    const inFlightRef = useRef(false);

    async function refreshAuthoritativeValues() {
        if (inFlightRef.current) return;

        inFlightRef.current = true;
        setWorkingMode("refresh");
        setState("working");
        try {
            await onDone();
            setState("success");
        } catch {
            setState("refresh-error");
        } finally {
            inFlightRef.current = false;
        }
    }

    async function confirm() {
        if (pendingValue === undefined || inFlightRef.current) return;

        inFlightRef.current = true;
        setWorkingMode("mutation");
        setState("working");
        setFailureMessage(undefined);
        try {
            await run(pendingValue);
            setPendingValue(undefined);
            try {
                setWorkingMode("refresh");
                await onDone();
                setState("success");
            } catch {
                setState("refresh-error");
            }
        } catch (error: unknown) {
            setFailureMessage(getSafeAdminFailureMessage(error));
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
                    disabled={state === "working" || state === "refresh-error"}
                    onChange={(event) => {
                        if (event.target.value === value) return;
                        setState("idle");
                        setFailureMessage(undefined);
                        setPendingValue(event.target.value);
                    }}
                    value={value}
                >
                    {children}
                </select>
                {state === "refresh-error" ? (
                    <button
                        aria-label={`Refresh ${ariaLabel}`}
                        className="w-fit text-[10px] font-semibold text-brand"
                        onClick={() => void refreshAuthoritativeValues()}
                        type="button"
                    >
                        Refresh current values
                    </button>
                ) : state === "working" && workingMode === "refresh" ? (
                    <span className="text-[10px] text-text-soft" role="status">Refreshing current values…</span>
                ) : null}
                <AdminActionFeedback state={state} successMessage={successMessage} failureMessage={failureMessage} />
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
