export type ApiRuntimeState =
    | "STARTING"
    | "READY"
    | "FAILED"
    | "STOPPING";

let runtimeState: ApiRuntimeState = "STARTING";

export function getApiRuntimeState(): ApiRuntimeState {
    return runtimeState;
}

export function isApiRuntimeReady(): boolean {
    return runtimeState === "READY";
}

export function markApiRuntimeStarting(): void {
    runtimeState = "STARTING";
}

export function markApiRuntimeReady(): void {
    runtimeState = "READY";
}

export function markApiRuntimeFailed(): void {
    runtimeState = "FAILED";
}

export function markApiRuntimeStopping(): void {
    runtimeState = "STOPPING";
}
