const activeChatStreams = new Set<AbortController>();

export const CHAT_STREAM_SHUTDOWN_REASON = "SERVER_SHUTDOWN";

export function registerActiveChatStream(
    controller: AbortController,
): () => void {
    activeChatStreams.add(controller);

    return () => {
        activeChatStreams.delete(controller);
    };
}

export function abortActiveChatStreams(): number {
    const controllers = [...activeChatStreams];

    for (const controller of controllers) {
        controller.abort(CHAT_STREAM_SHUTDOWN_REASON);
    }

    return controllers.length;
}

export function isServerShutdownAbort(signal: AbortSignal): boolean {
    return signal.aborted && signal.reason === CHAT_STREAM_SHUTDOWN_REASON;
}
