export interface AdminPageState {
    readonly nextCursor: string | null;
    readonly status: "error" | "idle" | "loading";
}

export function AdminPaginationControl({
    label,
    page,
    onLoadMore,
}: Readonly<{
    label: string;
    page: AdminPageState;
    onLoadMore: () => void;
}>) {
    if (page.nextCursor === null) {
        return null;
    }

    return (
        <div className="mt-4 grid justify-items-center gap-2 border-t border-border-soft pt-4">
            {page.status === "error" ? (
                <span className="text-xs text-danger" role="alert">
                    More {label} could not be loaded.
                </span>
            ) : null}
            <button
                className="rounded-lg border border-border-default bg-white px-4 py-2 text-xs font-semibold text-brand-dark disabled:cursor-wait disabled:opacity-60"
                type="button"
                onClick={onLoadMore}
                disabled={page.status === "loading"}
            >
                {page.status === "loading"
                    ? "Loading more…"
                    : page.status === "error"
                        ? "Try again"
                        : `Load more ${label}`}
            </button>
        </div>
    );
}
