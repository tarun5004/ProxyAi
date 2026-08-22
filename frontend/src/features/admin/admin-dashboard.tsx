"use client";

import {
    ArrowLeft,
    Bell,
    ChartBar,
    Database,
    SignOut,
    WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { useAuth } from "@/features/auth/auth-provider";
import { appendUniquePage } from "@/lib/api/cursor-pagination";
import { ApiError } from "@/lib/errors/api-error";

import {
    getAdminBilling,
    getAdminSummary,
    listAdminAlerts,
    listAdminLogs,
    listAdminTeams,
    listAdminUsers,
    revokeAdminUserSessions,
    updateAdminAlert,
    updateAdminPolicy,
    updateAdminRetention,
    updateAdminUserRole,
    updateAdminUserStatus,
    updateAdminUserTeam,
} from "./admin.api";
import { AdminAuditBrowser } from "./admin-audit-browser";
import {
    AdminPaginationControl,
    type AdminPageState,
} from "./admin-pagination-control";
import type {
    AdminAlertItem,
    AdminBilling,
    AdminLogItem,
    AdminSummary,
    AdminTeamItem,
    AdminUserItem,
} from "./admin.types";
import {
    AdminActionFeedback,
    ConfirmedMutationButton,
    ConfirmedMutationSelect,
    getSafeAdminFailureMessage,
} from "./admin-mutation-confirmation";
import type { AdminActionState } from "./admin-mutation-confirmation";

type AdminTab = "overview" | "users" | "usage" | "alerts" | "logs" | "audit";
type LoadState = "loading" | "ready" | "error";
type AdminPageResource = "alerts" | "logs" | "teams" | "users";
type AdminResource = "summary" | "billing" | AdminPageResource;
type RunAdminOperation = (operation: () => Promise<unknown>) => Promise<unknown>;

type AdminPagination = Record<AdminPageResource, AdminPageState>;
type AdminResourceStates = Record<AdminResource, LoadState>;

interface AdminData {
    summary?: AdminSummary;
    billing?: AdminBilling;
    logs: AdminLogItem[];
    alerts: AdminAlertItem[];
    users: AdminUserItem[];
    teams: AdminTeamItem[];
}

const emptyData: AdminData = {
    logs: [],
    alerts: [],
    users: [],
    teams: [],
};

const emptyPagination: AdminPagination = {
    alerts: { nextCursor: null, status: "idle" },
    logs: { nextCursor: null, status: "idle" },
    teams: { nextCursor: null, status: "idle" },
    users: { nextCursor: null, status: "idle" },
};

const initialResourceStates: AdminResourceStates = {
    alerts: "loading",
    billing: "loading",
    logs: "loading",
    summary: "loading",
    teams: "loading",
    users: "loading",
};

function setAdminPageState(
    setPagination: React.Dispatch<React.SetStateAction<AdminPagination>>,
    resource: AdminPageResource,
    page: AdminPageState,
): void {
    setPagination((current) => ({
        ...current,
        [resource]: page,
    }));
}

export function AdminDashboard() {
    const auth = useAuth();
    const router = useRouter();
    const [tab, setTab] = useState<AdminTab>("overview");
    const [data, setData] = useState<AdminData>(emptyData);
    const [pagination, setPagination] = useState<AdminPagination>(emptyPagination);
    const [resourceStates, setResourceStates] = useState<AdminResourceStates>(initialResourceStates);
    const activePageRequests = useRef(new Set<AdminPageResource>());
    const permissions = auth.context?.permissions ?? [];
    const canViewLogs = permissions.includes("admin:view_logs");
    const canViewBilling = permissions.includes("admin:view_billing");
    const canManageUsers = permissions.includes("admin:manage_users");
    const canConfigurePolicy = permissions.includes("admin:configure_policy");
    const canExportAudit = permissions.includes("admin:export_audit");
    const canOpenAdmin = canViewLogs || canViewBilling || canManageUsers || canConfigurePolicy || canExportAudit;
    const accessToken = auth.accessToken;
    const retrySession = auth.retrySession;

    const loadResource = useCallback(async (resource: AdminResource, signal?: AbortSignal, showBoundaryState = true): Promise<void> => {
        if (!accessToken) {
            return;
        }

        if (showBoundaryState) {
            setResourceStates((current) => ({ ...current, [resource]: "loading" }));
        }

        try {
            if (resource === "summary") {
                const response = await getAdminSummary(accessToken, signal);
                setData((current) => ({ ...current, summary: response.data }));
            } else if (resource === "billing") {
                const response = await getAdminBilling(accessToken, signal);
                setData((current) => ({ ...current, billing: response.data }));
            } else if (resource === "logs") {
                const response = await listAdminLogs(accessToken, { signal });
                setData((current) => ({ ...current, logs: response.data.items }));
                setAdminPageState(setPagination, resource, {
                    nextCursor: response.meta.nextCursor ?? null,
                    status: "idle",
                });
            } else if (resource === "alerts") {
                const response = await listAdminAlerts(accessToken, { signal });
                setData((current) => ({ ...current, alerts: response.data.items }));
                setAdminPageState(setPagination, resource, {
                    nextCursor: response.meta.nextCursor ?? null,
                    status: "idle",
                });
            } else if (resource === "users") {
                const response = await listAdminUsers(accessToken, { signal });
                setData((current) => ({ ...current, users: response.data.items }));
                setAdminPageState(setPagination, resource, {
                    nextCursor: response.meta.nextCursor ?? null,
                    status: "idle",
                });
            } else {
                const response = await listAdminTeams(accessToken, { signal });
                setData((current) => ({ ...current, teams: response.data.items }));
                setAdminPageState(setPagination, resource, {
                    nextCursor: response.meta.nextCursor ?? null,
                    status: "idle",
                });
            }

            setResourceStates((current) => ({ ...current, [resource]: "ready" }));
        } catch (error: unknown) {
            if (error instanceof Error && error.name === "AbortError") {
                return;
            }

            if (showBoundaryState) {
                setResourceStates((current) => ({ ...current, [resource]: "error" }));
            }
            if (error instanceof ApiError && error.status === 401) {
                void retrySession();
            }
            throw error;
        }
    }, [accessToken, retrySession]);

    const refreshResources = useCallback(async (...resources: readonly AdminResource[]): Promise<void> => {
        await Promise.all(resources.map((resource) => loadResource(resource, undefined, false)));
    }, [loadResource]);

    const runAdminOperation = useCallback<RunAdminOperation>(async (operation) => {
        try {
            return await operation();
        } catch (error: unknown) {
            if (error instanceof ApiError && error.status === 401) {
                void retrySession();
            }
            throw error;
        }
    }, [retrySession]);

    useEffect(() => {
        if (!accessToken || !canOpenAdmin) {
            return;
        }

        const abortController = new AbortController();
        const resources: AdminResource[] = [
            ...(canViewLogs ? ["summary", "logs", "alerts"] as const : []),
            ...(canViewBilling ? ["billing"] as const : []),
            ...(canManageUsers ? ["users", "teams"] as const : []),
        ];

        queueMicrotask(() => {
            if (abortController.signal.aborted) return;
            for (const resource of resources) {
                void loadResource(resource, abortController.signal).catch(() => undefined);
            }
        });

        return () => abortController.abort();
    }, [accessToken, canManageUsers, canOpenAdmin, canViewBilling, canViewLogs, loadResource]);

    const tabs = useMemo(() => [
        ...(canViewLogs ? ["overview", "alerts", "logs", "audit"] as const : []),
        ...(canManageUsers ? ["users"] as const : []),
        ...(canViewBilling ? ["usage"] as const : []),
    ], [canManageUsers, canViewBilling, canViewLogs]);

    async function logout() {
        await auth.logout();
        router.replace("/login");
    }

    async function loadMore(resource: AdminPageResource) {
        const accessToken = auth.accessToken;
        const page = pagination[resource];

        if (
            !accessToken
            || page.nextCursor === null
            || page.status === "loading"
            || activePageRequests.current.has(resource)
        ) {
            return;
        }

        const cursor = page.nextCursor;
        activePageRequests.current.add(resource);
        setAdminPageState(setPagination, resource, { nextCursor: cursor, status: "loading" });

        try {
            if (resource === "logs") {
                const response = await listAdminLogs(accessToken, { cursor });
                setData((current) => ({
                    ...current,
                    logs: appendUniquePage(current.logs, response.data.items, (item) => item.requestId),
                }));
                setAdminPageState(setPagination, resource, {
                    nextCursor: response.meta.nextCursor ?? null,
                    status: "idle",
                });
            } else if (resource === "alerts") {
                const response = await listAdminAlerts(accessToken, { cursor });
                setData((current) => ({
                    ...current,
                    alerts: appendUniquePage(current.alerts, response.data.items, (item) => item.alertId),
                }));
                setAdminPageState(setPagination, resource, {
                    nextCursor: response.meta.nextCursor ?? null,
                    status: "idle",
                });
            } else if (resource === "users") {
                const response = await listAdminUsers(accessToken, { cursor });
                setData((current) => ({
                    ...current,
                    users: appendUniquePage(current.users, response.data.items, (item) => item.userId),
                }));
                setAdminPageState(setPagination, resource, {
                    nextCursor: response.meta.nextCursor ?? null,
                    status: "idle",
                });
            } else {
                const response = await listAdminTeams(accessToken, { cursor });
                setData((current) => ({
                    ...current,
                    teams: appendUniquePage(current.teams, response.data.items, (item) => item.teamId),
                }));
                setAdminPageState(setPagination, resource, {
                    nextCursor: response.meta.nextCursor ?? null,
                    status: "idle",
                });
            }
        } catch {
            setAdminPageState(setPagination, resource, {
                nextCursor: cursor,
                status: "error",
            });
        } finally {
            activePageRequests.current.delete(resource);
        }
    }

    return (
        <main className="min-h-dvh bg-surface-soft">
            <header className="sticky top-0 z-20 border-b border-border-default bg-white/95 backdrop-blur">
                <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
                    <div className="flex items-center gap-5">
                        <BrandLogo compact />
                        <span className="hidden h-7 w-px bg-border-default sm:block" />
                        <div>
                            <h1 className="m-0 text-base font-semibold">Organisation admin</h1>
                            <p className="m-0 text-xs text-text-faint">Permission-scoped operations with append-only audit records</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-white px-3 py-2 text-xs font-semibold" href="/chat">
                            <ArrowLeft size={16} /> Workspace
                        </Link>
                        <button className="grid size-9 place-items-center rounded-lg text-text-soft hover:bg-surface-green" onClick={() => void logout()} aria-label="Sign out">
                            <SignOut size={18} />
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto grid max-w-[1480px] gap-6 px-5 py-7 sm:px-8 lg:grid-cols-[210px_minmax(0,1fr)]">
                <nav className="flex gap-2 overflow-x-auto lg:grid lg:content-start" aria-label="Admin sections">
                    {tabs.map((item) => (
                        <button
                            key={item}
                            className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-left text-sm font-medium capitalize ${tab === item ? "bg-brand text-white" : "bg-white text-text-soft hover:bg-surface-green"}`}
                            onClick={() => setTab(item)}
                        >
                            {item}
                        </button>
                    ))}
                </nav>

                <section className="min-w-0">
                    {!canOpenAdmin ? (
                        <StatePanel title="Access denied" detail="Your current permissions do not include organisation administration." />
                    ) : tab === "overview" ? (
                        <ResourceBoundary
                            status={resourceStates.summary}
                            loadingTitle="Loading organisation overview"
                            errorTitle="Organisation overview unavailable"
                            onRetry={() => void loadResource("summary").catch(() => undefined)}
                        >
                            <Overview
                                summary={data.summary}
                                accessToken={accessToken}
                                canConfigure={canConfigurePolicy}
                                onChanged={() => refreshResources("summary")}
                                runOperation={runAdminOperation}
                            />
                        </ResourceBoundary>
                    ) : tab === "users" ? (
                        <UsersAndTeams
                            users={data.users}
                            teams={data.teams}
                            pagination={pagination}
                            resourceStates={resourceStates}
                            accessToken={accessToken}
                            onChanged={() => refreshResources("users", "teams")}
                            onLoadMore={loadMore}
                            onRetry={(resource) => void loadResource(resource).catch(() => undefined)}
                            runOperation={runAdminOperation}
                        />
                    ) : tab === "usage" ? (
                        <ResourceBoundary
                            status={resourceStates.billing}
                            loadingTitle="Loading authoritative usage"
                            errorTitle="Usage data unavailable"
                            onRetry={() => void loadResource("billing").catch(() => undefined)}
                        >
                            <Usage billing={data.billing} />
                        </ResourceBoundary>
                    ) : tab === "alerts" ? (
                        <ResourceBoundary
                            status={resourceStates.alerts}
                            loadingTitle="Loading anomaly alerts"
                            errorTitle="Anomaly alerts unavailable"
                            onRetry={() => void loadResource("alerts").catch(() => undefined)}
                        >
                            <Alerts
                                alerts={data.alerts}
                                page={pagination.alerts}
                                accessToken={accessToken}
                                onChanged={() => refreshResources("alerts", "summary")}
                                onLoadMore={() => void loadMore("alerts")}
                                runOperation={runAdminOperation}
                            />
                        </ResourceBoundary>
                    ) : tab === "logs" ? (
                        <ResourceBoundary
                            status={resourceStates.logs}
                            loadingTitle="Loading request logs"
                            errorTitle="Request logs unavailable"
                            onRetry={() => void loadResource("logs").catch(() => undefined)}
                        >
                            <Logs logs={data.logs} page={pagination.logs} onLoadMore={() => void loadMore("logs")} />
                        </ResourceBoundary>
                    ) : accessToken ? (
                        <AdminAuditBrowser
                            accessToken={accessToken}
                            canExport={canExportAudit}
                            onUnauthorized={() => void retrySession()}
                        />
                    ) : null}
                </section>
            </div>
        </main>
    );
}

function Overview({ summary, accessToken, canConfigure, onChanged, runOperation }: Readonly<{ summary?: AdminSummary; accessToken?: string; canConfigure: boolean; onChanged: () => Promise<void>; runOperation: RunAdminOperation }>) {
    if (!summary) {
        return <StatePanel title="No overview permission" detail="Summary data is unavailable for this account." />;
    }

    const cards = [
        ["Requests", summary.requests.total, ChartBar],
        ["Known tokens", summary.usage.totalTokens, Database],
        ["Unknown usage", summary.usage.unknownRequestCount, WarningCircle],
        ["Open alerts", summary.alerts.open, Bell],
    ] as const;

    return (
        <div className="grid gap-6">
            <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-brand">{summary.organisation.plan} plan</p>
                <h2 className="mt-2 mb-1 text-2xl font-semibold tracking-[-0.03em]">{summary.organisation.name}</h2>
                <p className="m-0 text-sm text-text-soft">Current-month authoritative operational summary.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map(([label, value, Icon]) => (
                    <article className="rounded-xl border border-border-default bg-white p-5 shadow-panel" key={label}>
                        <Icon className="text-brand" size={23} />
                        <strong className="mt-5 block text-2xl">{formatNumber(value)}</strong>
                        <span className="text-xs text-text-soft">{label}</span>
                    </article>
                ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Request outcomes">
                    <MetricRows rows={[
                        ["Completed", summary.requests.completed],
                        ["Masked", summary.requests.masked],
                        ["Blocked", summary.requests.blocked],
                        ["Failed", summary.requests.failed],
                        ["Interrupted", summary.requests.interrupted],
                    ]} />
                </Panel>
                <Panel title="Provider health">
                    {summary.providerHealth.map((provider) => (
                        <div className="flex items-center justify-between border-b border-border-soft py-3 last:border-0" key={provider.providerId}>
                            <span className="font-medium capitalize">{provider.providerId}</span>
                            <Badge value={provider.state} />
                        </div>
                    ))}
                </Panel>
            </div>
            <Panel title="Provider and model requests">
                {summary.providerModels.length === 0 ? <Empty label="No provider requests in this period." /> : (
                    <MetricRows rows={summary.providerModels.map((item) => [`${item.providerId} · ${item.model}`, item.requestCount])} />
                )}
            </Panel>
            {canConfigure && accessToken ? (
                <PolicyControls
                    key={`${summary.organisation.policy.maskThreshold}:${summary.organisation.policy.blockThreshold}:${summary.budget.monthlyBudgetTokens}:${summary.organisation.retentionMode}`}
                    summary={summary}
                    accessToken={accessToken}
                    onChanged={onChanged}
                    runOperation={runOperation}
                />
            ) : null}
        </div>
    );
}

function UsersAndTeams({ users, teams, pagination, resourceStates, accessToken, onChanged, onLoadMore, onRetry, runOperation }: Readonly<{ users: AdminUserItem[]; teams: AdminTeamItem[]; pagination: AdminPagination; resourceStates: AdminResourceStates; accessToken?: string; onChanged: () => Promise<void>; onLoadMore: (resource: AdminPageResource) => Promise<void>; onRetry: (resource: AdminPageResource) => void; runOperation: RunAdminOperation }>) {
    const teamNames = new Map(teams.map((team) => [team.teamId, team.name]));
    return (
        <div className="grid gap-6">
            <SectionHeading title="Users and teams" detail="Permission-scoped changes are validated by the backend and recorded in the append-only audit trail." />
            <ResourceBoundary status={resourceStates.users} loadingTitle="Loading users" errorTitle="Users unavailable" onRetry={() => onRetry("users")}>
                <Panel title={`Users (${users.length} loaded)`}>
                    {users.length === 0 ? <Empty label="No users found." /> : users.map((user) => (
                        <div className="grid gap-2 border-b border-border-soft py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={user.userId}>
                            <div><strong className="block text-sm">{user.displayName}</strong><span className="text-xs text-text-soft">{user.email}</span></div>
                            {accessToken ? <UserControls user={user} teams={teams} accessToken={accessToken} onChanged={onChanged} runOperation={runOperation} /> : <Badge value={user.role.replaceAll("_", " ")} />}
                            <span className="text-xs text-text-soft">{user.teamId ? teamNames.get(user.teamId) ?? "Assigned team" : "No team"} · {user.status}</span>
                        </div>
                    ))}
                    <AdminPaginationControl label="users" page={pagination.users} onLoadMore={() => void onLoadMore("users")} />
                </Panel>
            </ResourceBoundary>
            <ResourceBoundary status={resourceStates.teams} loadingTitle="Loading teams" errorTitle="Teams unavailable" onRetry={() => onRetry("teams")}>
                <Panel title={`Teams (${teams.length} loaded)`}>
                    {teams.length === 0 ? <Empty label="No teams found." /> : teams.map((team) => (
                        <div className="flex items-center justify-between gap-4 border-b border-border-soft py-4 last:border-0" key={team.teamId}>
                            <div><strong className="block text-sm">{team.name}</strong><span className="text-xs text-text-soft">{team.description ?? "No description"}</span></div>
                            <span className="text-xs text-text-soft">{team.memberCount} members · {team.isActive ? "Active" : "Inactive"}</span>
                        </div>
                    ))}
                    <AdminPaginationControl label="teams" page={pagination.teams} onLoadMore={() => void onLoadMore("teams")} />
                </Panel>
            </ResourceBoundary>
        </div>
    );
}

function Usage({ billing }: Readonly<{ billing?: AdminBilling }>) {
    if (!billing) return <StatePanel title="No billing permission" detail="Token accounting is unavailable for this account." />;

    return (
        <div className="grid gap-6">
            <SectionHeading title={`Usage · ${billing.period}`} detail="Known usage is authoritative; unresolved provider usage stays explicit." />
            {!billing.budget.accountingComplete ? (
                <div className="rounded-xl border border-[#f2c56d] bg-[#fff9e9] p-4 text-sm text-[#77530b]" role="status">
                    Accounting is incomplete: {billing.totals.unknownUsageRequestCount} request(s) have unknown provider usage.
                </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Known tokens" value={billing.totals.totalTokens} />
                <Stat label="Budget" value={billing.budget.tokenLimit} />
                <Stat label="Known remaining" value={billing.budget.remainingKnownTokens} />
            </div>
            <Panel title="Usage detail"><MetricRows rows={[
                ["Input tokens", billing.totals.inputTokens],
                ["Output tokens", billing.totals.outputTokens],
                ["Known usage requests", billing.totals.knownUsageRequestCount],
                ["Unknown usage requests", billing.totals.unknownUsageRequestCount],
            ]} /></Panel>
        </div>
    );
}

function Alerts({ alerts, page, accessToken, onChanged, onLoadMore, runOperation }: Readonly<{ alerts: AdminAlertItem[]; page: AdminPageState; accessToken?: string; onChanged: () => Promise<void>; onLoadMore: () => void; runOperation: RunAdminOperation }>) {
    return (
        <div className="grid gap-6">
            <SectionHeading title="Anomaly alerts" detail="Alert status changes are permission-scoped and recorded in the append-only audit trail." />
            <Panel title={`Alerts (${alerts.length} loaded)`}>
                {alerts.length === 0 ? <Empty label="No anomaly alerts found." /> : alerts.map((alert) => (
                    <div className="grid gap-2 border-b border-border-soft py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto]" key={alert.alertId}>
                        <div><strong className="text-sm">{alert.title}</strong><p className="mt-1 mb-0 text-xs text-text-soft">{alert.observedDay} · {formatNumber(alert.metadata.observedTokens)} tokens vs {formatNumber(alert.metadata.baselineAverageTokens)} baseline</p></div>
                        <div className="flex items-center gap-2"><Badge value={alert.status} />{accessToken ? <MutationButton label={alert.status === "OPEN" ? "Resolve" : "Reopen"} run={() => runOperation(() => updateAdminAlert(accessToken, alert.alertId, alert.status === "OPEN"))} onDone={onChanged} successMessage="Alert status saved and verified." /> : null}</div>
                    </div>
                ))}
                <AdminPaginationControl label="alerts" page={page} onLoadMore={onLoadMore} />
            </Panel>
        </div>
    );
}

function Logs({ logs, page, onLoadMore }: Readonly<{ logs: AdminLogItem[]; page: AdminPageState; onLoadMore: () => void }>) {
    return (
        <div className="grid gap-6">
            <SectionHeading title="Request logs" detail="Metadata only. Prompt and response content is never available here." />
            <Panel title={`Recent requests (${logs.length} loaded)`}>
                {logs.length === 0 ? <Empty label="No request logs found." /> : logs.map((log) => (
                    <div className="grid gap-2 border-b border-border-soft py-4 last:border-0 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center" key={log.requestId}>
                        <div><strong className="block text-sm">{log.providerId ? `${log.providerId} · ${log.model ?? "unknown model"}` : "Policy blocked before provider"}</strong><span className="text-xs text-text-soft">{new Date(log.createdAt).toLocaleString()} · {log.requestId.slice(0, 8)}</span></div>
                        <Badge value={log.policyAction.replaceAll("_", " ")} />
                        <span className="text-xs text-text-soft">{log.totalTokens === undefined ? "Usage unknown" : `${formatNumber(log.totalTokens)} tokens`}</span>
                    </div>
                ))}
                <AdminPaginationControl label="request logs" page={page} onLoadMore={onLoadMore} />
            </Panel>
        </div>
    );
}

function PolicyControls({ summary, accessToken, onChanged, runOperation }: Readonly<{ summary: AdminSummary; accessToken: string; onChanged: () => Promise<void>; runOperation: RunAdminOperation }>) {
    const [maskThreshold, setMaskThreshold] = useState(String(summary.organisation.policy.maskThreshold));
    const [blockThreshold, setBlockThreshold] = useState(String(summary.organisation.policy.blockThreshold));
    const [budget, setBudget] = useState(String(summary.budget.monthlyBudgetTokens));

    return <Panel title="Policy and retention settings"><div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium">Mask threshold<input className="rounded-lg border border-border-default px-3 py-2 text-sm" type="number" min="0" max="100" value={maskThreshold} onChange={(event) => setMaskThreshold(event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-medium">Block threshold<input className="rounded-lg border border-border-default px-3 py-2 text-sm" type="number" min="0" max="100" value={blockThreshold} onChange={(event) => setBlockThreshold(event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-medium">Monthly token budget<input className="rounded-lg border border-border-default px-3 py-2 text-sm" type="number" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
    </div><div className="mt-4 flex flex-wrap gap-2">
        <ConfirmedMutationButton
            label="Save policy"
            confirmation={{
                title: "Confirm policy and budget update",
                target: summary.organisation.name,
                changes: [
                    { label: "Mask threshold", before: String(summary.organisation.policy.maskThreshold), after: maskThreshold },
                    { label: "Block threshold", before: String(summary.organisation.policy.blockThreshold), after: blockThreshold },
                    { label: "Monthly token budget", before: String(summary.budget.monthlyBudgetTokens), after: budget },
                ],
                consequence: "Threshold changes alter future masking and blocking decisions. The monthly budget can block future chat requests when authoritative usage reaches the limit.",
                confirmLabel: "Apply policy",
            }}
            run={() => runOperation(() => updateAdminPolicy(accessToken, { maskThreshold: Number(maskThreshold), blockThreshold: Number(blockThreshold), monthlyTokenBudget: Number(budget) }))}
            onDone={onChanged}
        />
        <ConfirmedMutationButton
            label={`Use ${summary.organisation.retentionMode === "METADATA_ONLY" ? "encrypted storage" : "metadata only"}`}
            confirmation={retentionConfirmation(summary)}
            run={() => runOperation(() => updateAdminRetention(accessToken, summary.organisation.retentionMode === "METADATA_ONLY" ? "ENCRYPTED_STORAGE" : "METADATA_ONLY"))}
            onDone={onChanged}
        />
    </div></Panel>;
}

function UserControls({ user, teams, accessToken, onChanged, runOperation }: Readonly<{ user: AdminUserItem; teams: AdminTeamItem[]; accessToken: string; onChanged: () => Promise<void>; runOperation: RunAdminOperation }>) {
    const teamNames = new Map(teams.map((team) => [team.teamId, team.name]));
    const userTarget = `${user.displayName} (${user.email})`;

    return <div className="flex flex-wrap items-center justify-end gap-2">
        <ConfirmedMutationSelect
            ariaLabel={`Role for ${user.displayName}`}
            value={user.role}
            getConfirmation={(nextRole) => ({
                title: "Confirm user role change",
                target: userTarget,
                changes: [{ label: "Role", before: formatAdminValue(user.role), after: formatAdminValue(nextRole) }],
                consequence: nextRole === "ORG_ADMIN"
                    ? "This grants organisation-administrator privileges from the canonical role permission map."
                    : "Effective permissions will be recomputed from the selected canonical role.",
                confirmLabel: "Change role",
            })}
            run={(value) => runOperation(() => updateAdminUserRole(accessToken, user.userId, value as AdminUserItem["role"]))}
            onDone={onChanged}
        >
            <option value="EMPLOYEE">Employee</option><option value="TEAM_LEAD">Team lead</option><option value="ORG_ADMIN">Org admin</option>
        </ConfirmedMutationSelect>
        <ConfirmedMutationSelect
            ariaLabel={`Team for ${user.displayName}`}
            value={user.teamId ?? ""}
            getConfirmation={(nextTeamId) => ({
                title: "Confirm team assignment",
                target: userTarget,
                changes: [{
                    label: "Team",
                    before: user.teamId ? teamNames.get(user.teamId) ?? "Assigned team" : "No team",
                    after: nextTeamId ? teamNames.get(nextTeamId) ?? "Selected team" : "No team",
                }],
                consequence: "Future team-scoped authorization uses this assignment. The backend remains authoritative for tenant-scoped team validation.",
                confirmLabel: "Change team",
            })}
            run={(value) => runOperation(() => updateAdminUserTeam(accessToken, user.userId, value || null))}
            onDone={onChanged}
        >
            <option value="">No team</option>{teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}
        </ConfirmedMutationSelect>
        <ConfirmedMutationButton
            label={user.status === "ACTIVE" ? "Disable" : "Activate"}
            confirmation={statusConfirmation(user, userTarget)}
            run={() => runOperation(() => updateAdminUserStatus(accessToken, user.userId, user.status === "ACTIVE" ? "DISABLED" : "ACTIVE"))}
            onDone={onChanged}
        />
        <ConfirmedMutationButton
            label="Revoke sessions"
            confirmation={{
                title: "Confirm session revocation",
                target: userTarget,
                changes: [{ label: "Refresh sessions", before: "Active sessions retained", after: "All active sessions revoked" }],
                consequence: "All active refresh sessions for this user will be revoked. Existing access tokens retain their approved bounded lifetime.",
                confirmLabel: "Revoke sessions",
            }}
            run={() => runOperation(() => revokeAdminUserSessions(accessToken, user.userId))}
            onDone={onChanged}
        />
    </div>;
}

function MutationButton({ label, run, onDone, successMessage = "Action completed.", disabled = false }: Readonly<{ label: string; run: () => Promise<unknown>; onDone?: () => Promise<void> | void; successMessage?: string; disabled?: boolean }>) {
    const [state, setState] = useState<AdminActionState>("idle");
    const [failureMessage, setFailureMessage] = useState<string>();
    const [refreshing, setRefreshing] = useState(false);
    const inFlightRef = useRef(false);

    async function refreshAuthoritativeValues() {
        if (!onDone || inFlightRef.current) return;

        inFlightRef.current = true;
        setRefreshing(true);
        setState("working");
        try {
            await onDone();
            setState("success");
        } catch {
            setState("refresh-error");
        } finally {
            setRefreshing(false);
            inFlightRef.current = false;
        }
    }

    async function execute() {
        if (inFlightRef.current) return;

        inFlightRef.current = true;
        setRefreshing(false);
        setState("working");
        setFailureMessage(undefined);
        try {
            await run();
            try {
                setRefreshing(true);
                await onDone?.();
                setState("success");
            } catch {
                setState("refresh-error");
            }
        } catch (error: unknown) {
            setFailureMessage(getSafeAdminFailureMessage(error));
            setState("error");
        } finally {
            setRefreshing(false);
            inFlightRef.current = false;
        }
    }

    return <span className="grid gap-1"><button className="rounded-lg border border-border-default bg-white px-3 py-2 text-xs font-semibold disabled:opacity-60" disabled={disabled || state === "working"} onClick={() => state === "refresh-error" ? void refreshAuthoritativeValues() : void execute()} type="button">{state === "working" ? (refreshing ? "Refreshing…" : "Saving…") : state === "refresh-error" ? "Refresh" : state === "error" ? "Retry" : label}</button><AdminActionFeedback state={state} successMessage={successMessage} failureMessage={failureMessage} /></span>;
}

function retentionConfirmation(summary: AdminSummary) {
    const nextMode = summary.organisation.retentionMode === "METADATA_ONLY" ? "ENCRYPTED_STORAGE" : "METADATA_ONLY";
    return {
        title: "Confirm retention mode change",
        target: summary.organisation.name,
        changes: [{ label: "Retention mode", before: formatAdminValue(summary.organisation.retentionMode), after: formatAdminValue(nextMode) }],
        consequence: nextMode === "ENCRYPTED_STORAGE"
            ? "Future eligible message content may be retained only through approved encryption. Existing metadata-only history is not backfilled."
            : "Future message content will not be retained. Existing encrypted records are not converted to plaintext.",
        confirmLabel: "Change retention",
    } as const;
}

function statusConfirmation(user: AdminUserItem, userTarget: string) {
    const nextStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    return {
        title: "Confirm user status change",
        target: userTarget,
        changes: [{ label: "Status", before: formatAdminValue(user.status), after: formatAdminValue(nextStatus) }],
        consequence: nextStatus === "DISABLED"
            ? "Disabling prevents authentication and revokes this user's active refresh sessions."
            : "Activating permits authentication subject to organisation status and valid credentials; no session is issued automatically.",
        confirmLabel: nextStatus === "DISABLED" ? "Disable user" : "Activate user",
    } as const;
}

function formatAdminValue(value: string): string {
    return value.replaceAll("_", " ").toLowerCase().replace(/^./u, (character) => character.toUpperCase());
}

function ResourceBoundary({ status, loadingTitle, errorTitle, onRetry, children }: Readonly<{
    status: LoadState;
    loadingTitle: string;
    errorTitle: string;
    onRetry: () => void;
    children: React.ReactNode;
}>) {
    if (status === "loading") {
        return <StatePanel title={loadingTitle} detail="Reading authoritative tenant-scoped records…" />;
    }
    if (status === "error") {
        return <StatePanel title={errorTitle} detail="Other available admin sections remain usable. No cached or fabricated values are shown." action={onRetry} />;
    }
    return children;
}

function StatePanel({ title, detail, action }: Readonly<{ title: string; detail: string; action?: () => void }>) {
    return <div className="grid min-h-[360px] place-items-center rounded-2xl border border-border-default bg-white p-8 text-center shadow-panel"><div className="max-w-md"><WarningCircle className="mx-auto text-brand" size={32} /><h2 className="mt-4 mb-2 text-xl">{title}</h2><p className="text-sm leading-6 text-text-soft">{detail}</p>{action ? <button className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={action}>Try again</button> : null}</div></div>;
}

function SectionHeading({ title, detail }: Readonly<{ title: string; detail: string }>) {
    return <div><h2 className="m-0 text-2xl tracking-[-0.03em]">{title}</h2><p className="mt-2 mb-0 text-sm text-text-soft">{detail}</p></div>;
}

function Panel({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
    return <section className="rounded-xl border border-border-default bg-white p-5 shadow-panel"><h3 className="mt-0 mb-3 text-sm font-semibold">{title}</h3>{children}</section>;
}

function Stat({ label, value }: Readonly<{ label: string; value: number }>) {
    return <article className="rounded-xl border border-border-default bg-white p-5 shadow-panel"><strong className="block text-2xl">{formatNumber(value)}</strong><span className="text-xs text-text-soft">{label}</span></article>;
}

function MetricRows({ rows }: Readonly<{ rows: readonly (readonly [string, number])[] }>) {
    return <dl className="m-0 grid gap-1">{rows.map(([label, value]) => <div className="flex justify-between gap-4 border-b border-border-soft py-3 last:border-0" key={label}><dt className="text-sm text-text-soft">{label}</dt><dd className="m-0 text-sm font-semibold">{formatNumber(value)}</dd></div>)}</dl>;
}

function Badge({ value }: Readonly<{ value: string }>) {
    return <span className="w-fit rounded-full bg-brand-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-dark">{value}</span>;
}

function Empty({ label }: Readonly<{ label: string }>) {
    return <p className="my-7 text-center text-sm text-text-faint">{label}</p>;
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat().format(Math.round(value));
}
