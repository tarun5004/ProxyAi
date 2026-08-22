"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { appendUniquePage } from "@/lib/api/cursor-pagination";
import { ApiError } from "@/lib/errors/api-error";

import {
    downloadAdminAudit,
    listAdminAudit,
} from "./admin.api";
import {
    ADMIN_AUDIT_ACTIONS,
    type AdminAuditAction,
    type AdminAuditItem,
} from "./admin.types";
import {
    AdminPaginationControl,
    type AdminPageState,
} from "./admin-pagination-control";

interface AuditFilterState {
    readonly dateFrom: string;
    readonly dateTo: string;
    readonly actorId: string;
    readonly action: "" | AdminAuditAction;
}

interface AdminAuditBrowserProps {
    readonly accessToken: string;
    readonly canExport: boolean;
    readonly onUnauthorized: () => void;
}

type AuditLoadState = "loading" | "ready" | "error";

export function AdminAuditBrowser({
    accessToken,
    canExport,
    onUnauthorized,
}: Readonly<AdminAuditBrowserProps>) {
    const [draftFilters, setDraftFilters] = useState(createInitialFilters);
    const [appliedFilters, setAppliedFilters] = useState(createInitialFilters);
    const [records, setRecords] = useState<AdminAuditItem[]>([]);
    const [loadState, setLoadState] = useState<AuditLoadState>("loading");
    const [page, setPage] = useState<AdminPageState>({ nextCursor: null, status: "idle" });
    const [filterError, setFilterError] = useState<string>();
    const [exportState, setExportState] = useState<"idle" | "loading" | "error">("idle");
    const [reloadVersion, setReloadVersion] = useState(0);
    const pageRequestActive = useRef(false);

    const loadInitialPage = useCallback(async (signal?: AbortSignal) => {
        setLoadState("loading");
        try {
            const response = await listAdminAudit(accessToken, toApiFilters(appliedFilters, signal));
            setRecords(response.data.items);
            setPage({ nextCursor: response.meta.nextCursor ?? null, status: "idle" });
            setLoadState("ready");
        } catch (error: unknown) {
            if (error instanceof Error && error.name === "AbortError") return;
            if (error instanceof ApiError && error.status === 401) onUnauthorized();
            setLoadState("error");
        }
    }, [accessToken, appliedFilters, onUnauthorized]);

    useEffect(() => {
        const controller = new AbortController();
        queueMicrotask(() => {
            if (!controller.signal.aborted) void loadInitialPage(controller.signal);
        });
        return () => controller.abort();
    }, [loadInitialPage, reloadVersion]);

    function applyFilters(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        const error = validateFilters(draftFilters);
        if (error !== undefined) {
            setFilterError(error);
            return;
        }

        setFilterError(undefined);
        setAppliedFilters(draftFilters);
    }

    async function loadMore(): Promise<void> {
        if (page.nextCursor === null || page.status === "loading" || pageRequestActive.current) return;
        const cursor = page.nextCursor;
        pageRequestActive.current = true;
        setPage({ nextCursor: cursor, status: "loading" });

        try {
            const response = await listAdminAudit(accessToken, {
                ...toApiFilters(appliedFilters),
                cursor,
            });
            setRecords((current) => appendUniquePage(
                current,
                response.data.items,
                (record) => record.auditId,
            ));
            setPage({ nextCursor: response.meta.nextCursor ?? null, status: "idle" });
        } catch (error: unknown) {
            if (error instanceof ApiError && error.status === 401) onUnauthorized();
            setPage({ nextCursor: cursor, status: "error" });
        } finally {
            pageRequestActive.current = false;
        }
    }

    async function exportAudit(): Promise<void> {
        if (exportState === "loading") return;
        setExportState("loading");

        try {
            const filters = toApiFilters(appliedFilters);
            const blob = await downloadAdminAudit(
                accessToken,
                filters.dateFrom,
                filters.dateTo,
                {
                    ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
                    ...(filters.action === undefined ? {} : { action: filters.action }),
                },
            );
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "proxiai-audit.csv";
            anchor.click();
            URL.revokeObjectURL(url);
            setExportState("idle");
        } catch (error: unknown) {
            if (error instanceof ApiError && error.status === 401) onUnauthorized();
            setExportState("error");
        }
    }

    return (
        <div className="grid gap-6">
            <div>
                <h2 className="m-0 text-2xl font-semibold">Audit trail</h2>
                <p className="mt-1 text-sm text-text-soft">Append-only security and admin events. Prompt and response content is never exposed.</p>
            </div>

            <section className="rounded-2xl border border-border-default bg-white p-5 shadow-sm">
                <form className="grid gap-4 lg:grid-cols-4" aria-label="Audit filters" onSubmit={applyFilters}>
                    <label className="grid gap-1.5 text-xs font-semibold text-text-soft">
                        From
                        <input className="rounded-lg border border-border-default px-3 py-2 text-sm text-text-strong" type="datetime-local" value={draftFilters.dateFrom} onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))} required />
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-text-soft">
                        To
                        <input className="rounded-lg border border-border-default px-3 py-2 text-sm text-text-strong" type="datetime-local" value={draftFilters.dateTo} onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))} required />
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-text-soft">
                        Actor ID
                        <input className="rounded-lg border border-border-default px-3 py-2 text-sm text-text-strong" value={draftFilters.actorId} onChange={(event) => setDraftFilters((current) => ({ ...current, actorId: event.target.value.trim() }))} placeholder="Optional UUID" />
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-text-soft">
                        Event
                        <select className="rounded-lg border border-border-default px-3 py-2 text-sm text-text-strong" value={draftFilters.action} onChange={(event) => setDraftFilters((current) => ({ ...current, action: event.target.value as AuditFilterState["action"] }))}>
                            <option value="">All events</option>
                            {ADMIN_AUDIT_ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
                        </select>
                    </label>
                    <div className="flex flex-wrap items-center gap-3 lg:col-span-4">
                        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={loadState === "loading"}>Apply filters</button>
                        {canExport ? <button className="rounded-lg border border-border-default bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60" type="button" onClick={() => void exportAudit()} disabled={exportState === "loading"}>{exportState === "loading" ? "Exporting…" : "Export filtered CSV"}</button> : null}
                        <span className="text-xs text-text-faint">Range is limited to 90 days.</span>
                    </div>
                    {filterError === undefined ? null : <p className="m-0 text-sm text-danger lg:col-span-4" role="alert">{filterError}</p>}
                    {exportState !== "error" ? null : <p className="m-0 text-sm text-danger lg:col-span-4" role="alert">Audit export could not be completed.</p>}
                </form>
            </section>

            <section className="rounded-2xl border border-border-default bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="m-0 text-base font-semibold">Events ({records.length} loaded)</h3>
                    {loadState === "error" ? <button className="rounded-lg border border-border-default px-3 py-2 text-xs font-semibold" onClick={() => setReloadVersion((value) => value + 1)}>Try again</button> : null}
                </div>
                {loadState === "loading" ? <p className="my-7 text-center text-sm text-text-faint">Loading audit events…</p> : loadState === "error" ? <p className="my-7 text-center text-sm text-text-faint">Audit events are temporarily unavailable.</p> : records.length === 0 ? <p className="my-7 text-center text-sm text-text-faint">No audit events match these filters.</p> : records.map((record) => (
                    <article className="grid gap-2 border-b border-border-soft py-4 last:border-0 md:grid-cols-[minmax(0,1fr)_auto]" key={record.auditId}>
                        <div className="min-w-0">
                            <strong className="block break-words text-sm">{record.action}</strong>
                            <span className="block text-xs text-text-soft">{new Date(record.occurredAt).toLocaleString()} · {record.actorType === "SYSTEM" ? "System" : record.actorId?.slice(0, 8) ?? "User"}</span>
                            <span className="block break-words text-xs text-text-faint">{record.resourceType}{record.resourceId ? ` · ${record.resourceId}` : ""} · Request {record.requestId.slice(0, 12)}</span>
                        </div>
                        <span className="w-fit rounded-full bg-brand-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-dark">{record.outcome}</span>
                    </article>
                ))}
                {loadState === "ready" ? <AdminPaginationControl label="audit events" page={page} onLoadMore={() => void loadMore()} /> : null}
            </section>
        </div>
    );
}

function createInitialFilters(now = new Date()): AuditFilterState {
    return {
        dateFrom: toLocalDateTime(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000)),
        dateTo: toLocalDateTime(now),
        actorId: "",
        action: "",
    };
}

function toApiFilters(filters: AuditFilterState, signal?: AbortSignal) {
    return {
        dateFrom: new Date(filters.dateFrom).toISOString(),
        dateTo: new Date(filters.dateTo).toISOString(),
        ...(filters.actorId === "" ? {} : { actorId: filters.actorId }),
        ...(filters.action === "" ? {} : { action: filters.action }),
        ...(signal === undefined ? {} : { signal }),
    };
}

function validateFilters(filters: AuditFilterState): string | undefined {
    const from = new Date(filters.dateFrom);
    const to = new Date(filters.dateTo);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return "Choose a valid audit date range.";
    if (to < from) return "The end date must not be earlier than the start date.";
    if (to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1_000) return "Audit range cannot exceed 90 days.";
    if (filters.actorId !== "" && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.actorId)) return "Actor ID must be a valid UUID v4.";
    return undefined;
}

function toLocalDateTime(value: Date): string {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}
