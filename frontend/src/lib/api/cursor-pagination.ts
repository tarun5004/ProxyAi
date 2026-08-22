export interface CursorPageOptions {
    readonly cursor?: string;
    readonly signal?: AbortSignal;
}

export function createCursorPagePath(
    path: string,
    limit: number,
    cursor?: string,
): string {
    const query = new URLSearchParams({ limit: String(limit) });

    if (cursor !== undefined) {
        query.set("cursor", cursor);
    }

    return `${path}?${query.toString()}`;
}

export function appendUniquePage<T>(
    current: readonly T[],
    incoming: readonly T[],
    getId: (item: T) => string,
): T[] {
    const knownIds = new Set(current.map(getId));
    const appended = incoming.filter((item) => {
        const id = getId(item);

        if (knownIds.has(id)) {
            return false;
        }

        knownIds.add(id);
        return true;
    });

    return [...current, ...appended];
}
