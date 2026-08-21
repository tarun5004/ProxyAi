import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import {
    isServerShutdownAbort,
    registerActiveChatStream,
} from "../../shared/runtime/active-chat-streams.js";
import type { StreamChunk } from "../providers/provider.types.js";
import {
    defaultChatPipelineDependencies,
    finalizeChatStream,
    prepareChatStream,
    type ChatPipelineDependencies,
    type PreparedChatStream,
} from "./chat.service.js";
import { chatStreamRequestSchema } from "./chat.schema.js";
import { startSse, writeSseEvent } from "./chat.sse.js";

export function createChatStreamHandler(
    dependencies: ChatPipelineDependencies = defaultChatPipelineDependencies,
) {
    return async function streamChat(
        request: Request,
        response: Response,
    ): Promise<void> {
        if (!request.auth) {
            throw new AppError(
                401,
                "UNAUTHORIZED",
                "Authentication required.",
            );
        }

        const parsedRequest = chatStreamRequestSchema.safeParse(request.body);

        if (!parsedRequest.success) {
            throw new AppError(
                400,
                "VALIDATION_ERROR",
                "Request validation failed.",
                parsedRequest.error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                })),
            );
        }

        const abortController = new AbortController();
        const unregisterActiveStream = registerActiveChatStream(abortController);
        let disconnected = false;
        const handleDisconnect = () => {
            if (!response.writableEnded) {
                disconnected = true;
                abortController.abort();
            }
        };

        request.once("aborted", handleDisconnect);
        response.once("close", handleDisconnect);

        let prepared: PreparedChatStream | undefined;
        let accountingStarted = false;
        let firstTokenLogged = false;
        let terminalEventLogged = false;
        const startedAt = Date.now();

        const logTerminalEvent = (
            event: "chat.stream.completed"
                | "chat.stream.failed"
                | "chat.stream.interrupted",
            status: "COMPLETED" | "FAILED" | "INTERRUPTED",
            errorCode?: string,
        ) => {
            if (terminalEventLogged) {
                return;
            }

            terminalEventLogged = true;
            prepared?.executionMetrics.finish(status);
            const context = {
                durationMs: Date.now() - startedAt,
                errorCode,
                event,
                operation: "chat.stream",
                provider: prepared?.providerId,
                status,
            };

            if (status === "COMPLETED") {
                request.log.info(context, "Chat stream completed");
            } else {
                request.log.warn(context, "Chat stream ended without completion");
            }
        };

        try {
            prepared = await prepareChatStream(
                {
                    auth: request.auth,
                    requestId: request.requestId,
                    request: parsedRequest.data,
                    abortSignal: abortController.signal,
                },
                dependencies,
            );

            if (disconnected) {
                accountingStarted = true;
                await finalizeChatStream(
                    prepared,
                    { status: "INTERRUPTED" },
                    dependencies,
                );
                logTerminalEvent(
                    "chat.stream.interrupted",
                    "INTERRUPTED",
                    "CLIENT_DISCONNECTED",
                );
                return;
            }

            request.log.info(
                {
                    event: "chat.stream.started",
                    operation: "chat.stream",
                    provider: prepared.providerId,
                    status: "STARTED",
                },
                "Chat stream started",
            );
            startSse(response);
            await writeInitialEvents(response, prepared);

            let currentChunk: StreamChunk | undefined = prepared.firstChunk;
            let assistantContent = "";

            while (currentChunk !== undefined) {
                if (currentChunk.type === "token") {
                    assistantContent += currentChunk.text;
                    const written = await writeSseEvent(
                        response,
                        "token",
                        {
                            text: currentChunk.text,
                        },
                    );

                    if (!written) {
                        disconnected = true;
                        abortController.abort();
                        break;
                    }

                    if (!firstTokenLogged) {
                        firstTokenLogged = true;
                        prepared.executionMetrics.observeFirstToken();
                        request.log.info(
                            {
                                durationMs: Date.now() - startedAt,
                                event: "chat.stream.first_token",
                                operation: "chat.stream",
                                provider: prepared.providerId,
                            },
                            "Chat stream emitted first token",
                        );
                    }
                } else {
                    accountingStarted = true;
                    await finalizeChatStream(
                        prepared,
                        {
                            status: "COMPLETED",
                            ...(currentChunk.usage === undefined
                                ? {}
                                : { usage: currentChunk.usage }),
                            assistantContent,
                        },
                        dependencies,
                    );
                    await writeSseEvent(response, "done", {
                        requestId: prepared.requestId,
                        provider: prepared.providerId,
                        model: prepared.model,
                        routingReason: prepared.routingReason,
                        ...(currentChunk.usage === undefined
                            ? {}
                            : { usage: currentChunk.usage }),
                        latencyMs: currentChunk.latencyMs,
                        cacheHit: false,
                        masked:
                            prepared.decision.action === "ALLOW_WITH_MASK",
                    });
                    logTerminalEvent(
                        "chat.stream.completed",
                        "COMPLETED",
                    );
                    response.end();
                    return;
                }

                const nextResult = await prepared.iterator.next();
                currentChunk = nextResult.done === true
                    ? undefined
                    : nextResult.value;
            }

            if (!accountingStarted) {
                accountingStarted = true;
                await finalizeChatStream(
                    prepared,
                    {
                        status: disconnected
                            ? "INTERRUPTED"
                            : "FAILED",
                    },
                    dependencies,
                );
                logTerminalEvent(
                    disconnected
                        ? "chat.stream.interrupted"
                        : "chat.stream.failed",
                    disconnected ? "INTERRUPTED" : "FAILED",
                    disconnected
                        ? "CLIENT_DISCONNECTED"
                        : "STREAM_INTERRUPTED",
                );
            }

            if (!disconnected) {
                await writeSseEvent(response, "error", {
                    code: "STREAM_INTERRUPTED",
                    message: "The provider response was interrupted.",
                    requestId: prepared.requestId,
                    retryable: true,
                });
                response.end();
            }
        } catch (error: unknown) {
            const serverShutdown = isServerShutdownAbort(
                abortController.signal,
            );
            const interrupted = disconnected || serverShutdown;

            if (!response.headersSent) {
                throw error;
            }

            if (prepared !== undefined && !accountingStarted) {
                accountingStarted = true;

                try {
                    await finalizeChatStream(
                        prepared,
                        {
                            status: interrupted
                                ? "INTERRUPTED"
                                : "FAILED",
                        },
                        dependencies,
                    );
                } catch {}
            }

            logTerminalEvent(
                interrupted
                    ? "chat.stream.interrupted"
                    : "chat.stream.failed",
                interrupted ? "INTERRUPTED" : "FAILED",
                serverShutdown
                    ? "SERVER_SHUTDOWN"
                    : interrupted
                        ? "CLIENT_DISCONNECTED"
                        : "STREAM_INTERRUPTED",
            );

            if (!interrupted) {
                await writeSseEvent(response, "error", {
                    code: "STREAM_INTERRUPTED",
                    message: "The provider response was interrupted.",
                    requestId: request.requestId,
                    retryable: true,
                });
                response.end();
            }
        } finally {
            unregisterActiveStream();
            request.off("aborted", handleDisconnect);
            response.off("close", handleDisconnect);
        }
    };
}

async function writeInitialEvents(
    response: Response,
    prepared: PreparedChatStream,
): Promise<void> {
    await writeSseEvent(response, "request_started", {
        requestId: prepared.requestId,
        clientRequestId: prepared.clientRequestId,
    });
    await writeSseEvent(response, "policy", {
        action: prepared.decision.action,
        riskScore: prepared.decision.riskScore,
        categories: prepared.decision.categories,
        masked: prepared.decision.action === "ALLOW_WITH_MASK",
    });
    await writeSseEvent(response, "routing", {
        provider: prepared.providerId,
        routingReason: prepared.routingReason,
        fallbackPosition: 0,
    });
}

export const streamChat = createChatStreamHandler();
