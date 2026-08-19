export interface WorkerHealthState {
    readonly workerId: string;
    readonly workerType: string;
    readonly running: boolean;
    readonly healthy: boolean;
    readonly lastHeartbeatAt: string | null;
    readonly lastSuccessfulJobAt: string | null;
}

export interface WorkerHeartbeat {
    start(): void;
    stop(): Promise<void>;
    recordSuccessfulJob(): void;
    getHealth(): WorkerHealthState;
}

export interface WorkerHeartbeatScheduler {
    setInterval(callback: () => void, intervalMs: number): unknown;
    clearInterval(handle: unknown): void;
}

const defaultScheduler: WorkerHeartbeatScheduler = {
    setInterval(callback, intervalMs) {
        return setInterval(callback, intervalMs);
    },
    clearInterval(handle) {
        clearInterval(handle as NodeJS.Timeout);
    },
};

export function createWorkerHeartbeat(input: {
    readonly workerId: string;
    readonly workerType: string;
    readonly intervalMs: number;
    readonly freshnessMs: number;
    readonly probe: () => Promise<void>;
    readonly onFailure: () => void;
    readonly now?: () => Date;
    readonly scheduler?: WorkerHeartbeatScheduler;
}): WorkerHeartbeat {
    const now = input.now ?? (() => new Date());
    const scheduler = input.scheduler ?? defaultScheduler;
    let running = false;
    let heartbeatFailed = false;
    let timerHandle: unknown;
    let heartbeatInFlight: Promise<void> | undefined;
    let lastHeartbeatAt: Date | undefined;
    let lastSuccessfulJobAt: Date | undefined;

    const executeHeartbeat = async (): Promise<void> => {
        if (!running || heartbeatInFlight !== undefined) {
            return;
        }

        const operation = (async () => {
            try {
                await input.probe();

                if (running) {
                    lastHeartbeatAt = now();
                    heartbeatFailed = false;
                }
            } catch {
                if (running) {
                    heartbeatFailed = true;
                    input.onFailure();
                }
            }
        })();

        heartbeatInFlight = operation;

        try {
            await operation;
        } finally {
            if (heartbeatInFlight === operation) {
                heartbeatInFlight = undefined;
            }
        }
    };

    return {
        start() {
            if (running) {
                return;
            }

            running = true;
            heartbeatFailed = false;
            timerHandle = scheduler.setInterval(() => {
                void executeHeartbeat();
            }, input.intervalMs);
            void executeHeartbeat();
        },
        async stop() {
            if (!running) {
                return;
            }

            running = false;

            if (timerHandle !== undefined) {
                scheduler.clearInterval(timerHandle);
                timerHandle = undefined;
            }

            await heartbeatInFlight;
        },
        recordSuccessfulJob() {
            if (running) {
                lastSuccessfulJobAt = now();
            }
        },
        getHealth() {
            const heartbeatAgeMs = lastHeartbeatAt === undefined
                ? Number.POSITIVE_INFINITY
                : now().getTime() - lastHeartbeatAt.getTime();

            return Object.freeze({
                workerId: input.workerId,
                workerType: input.workerType,
                running,
                healthy: running
                    && !heartbeatFailed
                    && heartbeatAgeMs <= input.freshnessMs,
                lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null,
                lastSuccessfulJobAt:
                    lastSuccessfulJobAt?.toISOString() ?? null,
            });
        },
    };
}
