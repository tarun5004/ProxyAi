export const API_BASE_PATH = "/api/v1" as const;

export function createApiPath(path: string): string {
    return `${API_BASE_PATH}${path}`;
}
