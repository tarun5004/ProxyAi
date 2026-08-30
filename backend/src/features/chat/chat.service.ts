import { env } from "../../config/env.js";
import {
    ASYNC_JOB_SCHEMA_VERSION,
    REQUEST_BLOCKED_JOB_TYPE,
    REQUEST_COMPLETED_JOB_TYPE,
    type RequestCompletedStatus,
} from "../../shared/async/job-contract.js";
import { AppError } from "../../shared/errors/app-error.js";
import { appendAudit } from "../audit/audit.service.js";
import { buildAuditMetadata } from "../audit/audit.metadata.js";
import {
    createIdempotencyRequestFingerprint,
    idempotencyService,
    type IdempotencyReservation,
    type IdempotencyService,
} from "../../shared/idempotency/idempotency.service.js";
import { logger } from "../../shared/lib/logger.js";
import type { AuthContext } from "../auth/auth-context.types.js";
import { enqueueAnalyticsRequestOutcomeJob } from
    "../analytics/analytics.queue.js";
import { enqueueRequestCompletedJob } from "../billing/billing.queue.js";
import {
    appendRequestUsage,
    readAuthoritativeBudgetStatus,
} from "../billing/billing.service.js";
import { getConversationForOwner } from "../conversations/conversation.service.js";
import {
    loadRecentProviderHistory,
    persistCompletedMessagePair,
} from "../messages/message.service.js";
import type { RetainedConversationMessage } from "../messages/message.types.js";
import type { RetentionMode } from "../organisations/organisation.types.js";
import { processPiiPromptImmutably } from "../pii/pii-prompt-processor.js";
import { calculatePiiRisk } from "../pii/pii-risk-scorer.js";
import { emitPolicyDecisionEvent } from "../policy/policy-events.js";
import {
    evaluateAllow,
    evaluateAllowWithMask,
    evaluateBlock,
} from "../policy/policy-evaluator.js";
import type {
    BudgetStatus,
    PolicyDecision,
    PolicyEvaluationInput,
} from "../policy/policy.types.js";
import {
    type ProviderFallbackCandidate,
    type ProviderFallbackEvent,
    streamWithOrderedFallback,
} from "../providers/provider-fallback.js";
import {
    readProviderHealth,
    type ProviderHealthState,
} from "../providers/provider-health.store.js";
import { productionProviderCandidates } from
    "../providers/provider-runtime.registry.js";
import type {
    ProviderId,
    StreamChunk,
    TokenUsage,
} from "../providers/provider.types.js";
import type { EnqueueRecoveryScope } from
    "../recovery/enqueue-recovery.repository.js";
import { recordFailedEnqueue } from
    "../recovery/enqueue-recovery.service.js";
import {
    chatControlService,
    type ChatControlService,
} from "./chat-control.service.js";
import {
    recordBlockedChat,
    startAcceptedChatMetrics,
    type ChatExecutionMetrics,
} from "./chat.metrics.js";
import { buildProductAwareProviderMessages } from "./product-facts.js";
import { buildBoundedProviderHistory } from "./chat-context.js";
import {
    loadChatOrganisationContext,
    type ChatOrganisationContext,
} from "./chat.repository.js";
import type { ChatStreamRequest } from "./chat.schema.js";

export interface ChatPipelineDependencies {
    readonly assertConversationOwner: (
        orgId: string,
        userId: string,
        conversationId: string,
    ) => Promise<unknown>;
    readonly loadOrganisationContext: (
        orgId: string,
    ) => Promise<ChatOrganisationContext>;
    readonly controls: ChatControlService;
    readonly idempotency: IdempotencyService;
    readonly readBudgetStatus: (
        orgId: string,
    ) => Promise<Readonly<BudgetStatus>>;
    readonly processPrompt: typeof processPiiPromptImmutably;
    readonly loadConversationHistory: (input: {
        readonly orgId: string;
        readonly userId: string;
        readonly conversationId: string;
    }) => Promise<readonly RetainedConversationMessage[]>;
    readonly candidates: readonly ProviderFallbackCandidate[];
    readonly readProviderHealth: (
        providerId: ProviderId,
    ) => Promise<Readonly<{ state: ProviderHealthState }>>;
    readonly streamProvider: typeof streamWithOrderedFallback;
    readonly appendUsage: typeof appendRequestUsage;
    readonly enqueueBillingJob: typeof enqueueRequestCompletedJob;
    readonly enqueueAnalyticsJob:
        typeof enqueueAnalyticsRequestOutcomeJob;
    readonly recordEnqueueFailure: typeof recordFailedEnqueue;
    readonly emitPolicyEvent: typeof emitPolicyDecisionEvent;
    readonly appendAudit: typeof appendAudit;
    readonly persistMessages: typeof persistCompletedMessagePair;
}

export interface PreparedChatStream {
    readonly requestId: string;
    readonly clientRequestId: string;
    readonly orgId: string;
    readonly userId: string;
    readonly decision: PolicyDecision;
    readonly routingReason: "manual" | "auto";
    readonly providerId: "groq";
    readonly model: string;
    readonly iterator: AsyncIterator<StreamChunk>;
    readonly firstChunk: StreamChunk;
    readonly fallbackEvents: readonly ProviderFallbackEvent[];
    readonly reservation: IdempotencyReservation;
    readonly conversationId: string;
    readonly retentionMode: RetentionMode;
    readonly originalUserContent: string;
    readonly executionMetrics: ChatExecutionMetrics;
}

export const defaultChatPipelineDependencies: ChatPipelineDependencies = {
    assertConversationOwner: getConversationForOwner,
    loadOrganisationContext: loadChatOrganisationContext,
    controls: chatControlService,
    idempotency: idempotencyService,
    readBudgetStatus: readAuthoritativeBudgetStatus,
    processPrompt: processPiiPromptImmutably,
    loadConversationHistory: loadRecentProviderHistory,
    candidates: productionProviderCandidates,
    readProviderHealth,
    streamProvider: streamWithOrderedFallback,
    appendUsage: appendRequestUsage,
    enqueueBillingJob: enqueueRequestCompletedJob,
    enqueueAnalyticsJob: enqueueAnalyticsRequestOutcomeJob,
    recordEnqueueFailure: recordFailedEnqueue,
    emitPolicyEvent: emitPolicyDecisionEvent,
    appendAudit,
    persistMessages: persistCompletedMessagePair,
};

export async function prepareChatStream(
    input: {
        readonly auth: Readonly<AuthContext>;
        readonly requestId: string;
        readonly request: Readonly<ChatStreamRequest>;
        readonly abortSignal: AbortSignal;
    },
    dependencies: ChatPipelineDependencies = defaultChatPipelineDependencies,
): Promise<PreparedChatStream> {
    await dependencies.assertConversationOwner(
        input.auth.orgId,
        input.auth.userId,
        input.request.conversationId,
    );
    const organisation = await dependencies.loadOrganisationContext(
        input.auth.orgId,
    );
    assertRoutingAllowed(input.request, organisation);

    const reservation = await dependencies.idempotency.reserve({
        orgId: input.auth.orgId,
        userId: input.auth.userId,
        clientRequestId: input.request.clientRequestId,
        requestId: input.requestId,
        requestFingerprint: createIdempotencyRequestFingerprint({
            conversationId: input.request.conversationId,
            prompt: input.request.prompt,
            routingMode: input.request.routingMode,
            ...(input.request.providerId === undefined
                ? {}
                : { providerId: input.request.providerId }),
        }),
    });
    let providerStarted = false;
    let reservationFinalized = false;
    let policyAction: "ALLOW" | "ALLOW_WITH_MASK" | undefined;
    let executionMetrics: ChatExecutionMetrics | undefined;

    try {
        await dependencies.controls.consumeRateLimit({
            orgId: input.auth.orgId,
            userId: input.auth.userId,
            plan: organisation.plan,
        });
        const budget = await dependencies.readBudgetStatus(input.auth.orgId);
        const pii = dependencies.processPrompt({
            prompt: input.request.prompt,
        });
        const risk = calculatePiiRisk(pii.classification);
        const decision = evaluatePolicy({
            pii,
            risk,
            budget,
            thresholds: organisation.policy,
        });

        dependencies.emitPolicyEvent({
            requestId: input.requestId,
            decision,
            auth: input.auth,
        });
        await dependencies.appendAudit({
            orgId: input.auth.orgId,
            actorId: input.auth.userId,
            actorType: "USER",
            actorRole: input.auth.role,
            action: decision.action === "ALLOW"
                ? "policy.allow"
                : decision.action === "ALLOW_WITH_MASK"
                    ? "policy.mask"
                    : "policy.block",
            outcome: "SUCCESS",
            resourceType: "POLICY_DECISION",
            resourceId: input.requestId,
            metadata: buildAuditMetadata(
                decision.action === "ALLOW"
                    ? "policy.allow"
                    : decision.action === "ALLOW_WITH_MASK"
                        ? "policy.mask"
                        : "policy.block",
                {
                    riskScore: decision.riskScore,
                    reasonCode: decision.reasonCode,
                    categoryCount: decision.categories.length,
                },
            ),
            requestId: input.requestId,
        });

        if (decision.action === "BLOCK") {
            recordBlockedChat();
            const occurredAt = new Date().toISOString();

            await dependencies.appendUsage({
                requestId: input.requestId,
                orgId: input.auth.orgId,
                userId: input.auth.userId,
                status: "BLOCKED",
                policyAction: "BLOCK",
            });

            try {
                await dependencies.enqueueAnalyticsJob({
                    schemaVersion: ASYNC_JOB_SCHEMA_VERSION,
                    jobType: REQUEST_BLOCKED_JOB_TYPE,
                    requestId: input.requestId,
                    orgId: input.auth.orgId,
                    userId: input.auth.userId,
                    status: "BLOCKED",
                    policyAction: "BLOCK",
                    occurredAt,
                });
            } catch {
                logger.error(
                    {
                        errorCode: "ANALYTICS_JOB_ENQUEUE_FAILED",
                        event:
                            "analytics.job.enqueue_failed_after_request_log",
                        jobType: REQUEST_BLOCKED_JOB_TYPE,
                        orgId: input.auth.orgId,
                        requestId: input.requestId,
                        userId: input.auth.userId,
                    },
                    "Analytics job enqueue failed after RequestLog persistence",
                );
                await recordRecoveryFailureSafely(
                    {
                        orgId: input.auth.orgId,
                        requestId: input.requestId,
                        queueName: "analytics-queue",
                        jobType: REQUEST_BLOCKED_JOB_TYPE,
                    },
                    dependencies,
                );
            }

            await reservation.markCompleted();
            reservationFinalized = true;

            throw new AppError(
                403,
                "POLICY_BLOCKED",
                "This request was blocked by your organisation's data policy.",
                {
                    riskScore: decision.riskScore,
                    categories: decision.categories,
                },
            );
        }

        const approvedPrompt = decision.action === "ALLOW_WITH_MASK"
            ? decision.providerPrompt
            : input.request.prompt;
        policyAction = decision.action;
        executionMetrics = startAcceptedChatMetrics(decision.action);
        const candidate = await selectProductionCandidate(
            input.request,
            dependencies.candidates,
            dependencies.readProviderHealth,
        );
        const providerHistory = organisation.retentionMode === "ENCRYPTED_STORAGE"
            ? buildBoundedProviderHistory({
                messages: await dependencies.loadConversationHistory({
                    orgId: input.auth.orgId,
                    userId: input.auth.userId,
                    conversationId: input.request.conversationId,
                }),
                sanitizeUserContent: (content) => {
                    const historicalPii = dependencies.processPrompt({ prompt: content });
                    const historicalDecision = evaluatePolicy({
                        pii: historicalPii,
                        risk: calculatePiiRisk(historicalPii.classification),
                        budget,
                        thresholds: organisation.policy,
                    });

                    if (historicalDecision.action === "BLOCK") {
                        return null;
                    }

                    return historicalDecision.action === "ALLOW_WITH_MASK"
                        ? historicalDecision.providerPrompt
                        : content;
                },
            })
            : [];
        const fallbackEvents: ProviderFallbackEvent[] = [];
        const providerStream = dependencies.streamProvider(
            {
                requestId: input.requestId,
                messages: buildProductAwareProviderMessages({
                    originalPrompt: input.request.prompt,
                    approvedPrompt,
                    historyMessages: providerHistory,
                }),
                maxOutputTokens:
                    Math.min(
                        candidate.adapter.getCapabilities().maxOutputTokens,
                        organisation.policy.maxOutputTokensPerRequest,
                    ),
                abortSignal: input.abortSignal,
            },
            [candidate],
            {
                recordEvent: (event) => {
                    fallbackEvents.push(Object.freeze({ ...event }));
                    logProviderLifecycleEvent(event);
                },
            },
        );
        const iterator = providerStream[Symbol.asyncIterator]();

        reservation.markProviderExecutionStarted();
        providerStarted = true;
        executionMetrics.markProviderStarted(candidate.adapter.providerId);
        const firstResult = await iterator.next();

        if (firstResult.done === true) {
            throw new AppError(
                503,
                "PROVIDER_UNAVAILABLE",
                "No provider response was available.",
            );
        }

        return {
            requestId: input.requestId,
            clientRequestId: input.request.clientRequestId,
            orgId: input.auth.orgId,
            userId: input.auth.userId,
            decision,
            routingReason: input.request.routingMode,
            providerId: "groq",
            model: candidate.model,
            iterator,
            firstChunk: firstResult.value,
            fallbackEvents: Object.freeze(fallbackEvents),
            reservation,
            conversationId: input.request.conversationId,
            retentionMode: organisation.retentionMode,
            originalUserContent: input.request.prompt,
            executionMetrics,
        };
    } catch (error: unknown) {
        executionMetrics?.finish(
            input.abortSignal.aborted ? "INTERRUPTED" : "FAILED",
        );

        if (!reservationFinalized) {
            if (providerStarted) {
                await recordUsageAndComplete(
                    {
                        requestId: input.requestId,
                        orgId: input.auth.orgId,
                        userId: input.auth.userId,
                        providerId: "groq",
                        model: env.GROQ_MODEL,
                        reservation,
                    },
                    {
                        status: "FAILED",
                        policyAction: requireProviderPolicyAction(
                            policyAction,
                        ),
                    },
                    dependencies,
                );
            } else {
                await reservation.releaseBeforeExecution();
            }
        }

        throw normalizePreStreamError(error);
    }
}

function logProviderLifecycleEvent(event: ProviderFallbackEvent): void {
    const context = {
        attemptNumber: event.attemptNumber,
        errorCategory: event.errorCategory,
        event: event.type,
        model: event.model,
        operation: "provider.stream",
        provider: event.providerId,
        requestId: event.requestId,
        statusCode: event.statusCode,
    };

    if (
        event.type === "provider.fallback_candidate_failed"
        || event.type === "provider.fallback_all_unavailable"
    ) {
        logger.warn(context, "Provider stream attempt failed");
        return;
    }

    logger.info(context, "Provider stream attempt completed");
}

function requireProviderPolicyAction(
    policyAction: "ALLOW" | "ALLOW_WITH_MASK" | undefined,
): "ALLOW" | "ALLOW_WITH_MASK" {
    if (policyAction === undefined) {
        throw new Error("Provider policy action is unavailable.");
    }

    return policyAction;
}

export async function finalizeChatStream(
    prepared: PreparedChatStream,
    outcome: {
        readonly status: RequestCompletedStatus;
        readonly usage?: Readonly<TokenUsage>;
        readonly assistantContent?: string;
    },
    dependencies: ChatPipelineDependencies = defaultChatPipelineDependencies,
): Promise<void> {
    await recordUsageAndComplete(
        prepared,
        {
            ...outcome,
            policyAction: prepared.decision.action === "ALLOW_WITH_MASK"
                ? "ALLOW_WITH_MASK"
                : "ALLOW",
            ...(outcome.assistantContent === undefined
                ? {}
                : {
                    messagePersistence: {
                        conversationId: prepared.conversationId,
                        retentionMode: prepared.retentionMode,
                        userContent: prepared.originalUserContent,
                        assistantContent: outcome.assistantContent,
                    },
                }),
        },
        dependencies,
    );
}

function evaluatePolicy(input: PolicyEvaluationInput): PolicyDecision {
    const decision = evaluateBlock(input)
        ?? evaluateAllowWithMask(input)
        ?? evaluateAllow(input);

    if (decision === null) {
        throw new Error("Policy evaluation did not produce a decision.");
    }

    return decision;
}

function assertRoutingAllowed(
    request: Readonly<ChatStreamRequest>,
    organisation: ChatOrganisationContext,
): void {
    if (
        request.routingMode === "auto"
        && !organisation.autoRoutingEnabled
    ) {
        throw new AppError(
            403,
            "FEATURE_DISABLED",
            "Automatic provider routing is not enabled.",
        );
    }
}

export async function selectProductionCandidate(
    request: Readonly<ChatStreamRequest>,
    candidates: readonly ProviderFallbackCandidate[],
    readHealth: ChatPipelineDependencies["readProviderHealth"],
): Promise<ProviderFallbackCandidate> {
    const candidate = candidates.find(
        (entry) => entry.adapter.providerId === "groq",
    );

    if (
        candidate === undefined
        || (
            request.routingMode === "manual"
            && request.providerId !== candidate.adapter.providerId
        )
    ) {
        throw new AppError(
            503,
            "PROVIDER_UNAVAILABLE",
            "No configured provider is available.",
        );
    }

    const health = await readHealth(candidate.adapter.providerId);

    if (health.state === "UNHEALTHY") {
        throw new AppError(
            503,
            "PROVIDER_UNAVAILABLE",
            "No configured provider is available.",
        );
    }

    return candidate;
}

async function recordUsageAndComplete(
    input: {
        readonly requestId: string;
        readonly orgId: string;
        readonly userId: string;
        readonly providerId: "groq";
        readonly model: string;
        readonly reservation: IdempotencyReservation;
    },
    outcome: {
        readonly status: RequestCompletedStatus;
        readonly policyAction: "ALLOW" | "ALLOW_WITH_MASK";
        readonly usage?: Readonly<TokenUsage>;
        readonly messagePersistence?: {
            readonly conversationId: string;
            readonly retentionMode: RetentionMode;
            readonly userContent: string;
            readonly assistantContent: string;
        };
    },
    dependencies: ChatPipelineDependencies,
): Promise<void> {
    let usagePersisted = false;
    let messagePersistenceError: unknown;

    try {
        const occurredAt = new Date().toISOString();

        await dependencies.appendUsage({
            requestId: input.requestId,
            orgId: input.orgId,
            userId: input.userId,
            status: outcome.status,
            policyAction: outcome.policyAction,
            providerId: input.providerId,
            model: input.model,
            ...(outcome.usage === undefined
                ? {}
                : { usage: outcome.usage }),
        });
        usagePersisted = true;

        if (
            outcome.status === "COMPLETED"
            && outcome.messagePersistence !== undefined
        ) {
            try {
                await dependencies.persistMessages({
                    orgId: input.orgId,
                    userId: input.userId,
                    requestId: input.requestId,
                    conversationId: outcome.messagePersistence.conversationId,
                    retentionMode: outcome.messagePersistence.retentionMode,
                    userContent: outcome.messagePersistence.userContent,
                    assistantContent: outcome.messagePersistence.assistantContent,
                    ...(outcome.usage === undefined
                        ? {}
                        : {
                            inputTokenCount: outcome.usage.inputTokens,
                            outputTokenCount: outcome.usage.outputTokens,
                        }),
                });
            } catch (error: unknown) {
                messagePersistenceError = error;
            }
        }

        try {
            await dependencies.enqueueBillingJob({
                schemaVersion: ASYNC_JOB_SCHEMA_VERSION,
                jobType: REQUEST_COMPLETED_JOB_TYPE,
                requestId: input.requestId,
                orgId: input.orgId,
                userId: input.userId,
                status: outcome.status,
                policyAction: outcome.policyAction,
                providerId: input.providerId,
                model: input.model,
                ...(outcome.usage === undefined
                    ? {}
                    : { usage: outcome.usage }),
                occurredAt,
            });
        } catch {
            logger.error(
                {
                    errorCode: "BILLING_JOB_ENQUEUE_FAILED",
                    event: "billing.job.enqueue_failed_after_request_log",
                    orgId: input.orgId,
                    requestId: input.requestId,
                    userId: input.userId,
                },
                "Billing job enqueue failed after authoritative usage persistence",
            );
            await recordRecoveryFailureSafely(
                {
                    orgId: input.orgId,
                    requestId: input.requestId,
                    queueName: "billing-queue",
                    jobType: REQUEST_COMPLETED_JOB_TYPE,
                },
                dependencies,
            );
        }

        try {
            await dependencies.enqueueAnalyticsJob({
                schemaVersion: ASYNC_JOB_SCHEMA_VERSION,
                jobType: REQUEST_COMPLETED_JOB_TYPE,
                requestId: input.requestId,
                orgId: input.orgId,
                userId: input.userId,
                status: outcome.status,
                policyAction: outcome.policyAction,
                providerId: input.providerId,
                model: input.model,
                ...(outcome.usage === undefined
                    ? {}
                    : { usage: outcome.usage }),
                occurredAt,
            });
        } catch {
            logger.error(
                {
                    errorCode: "ANALYTICS_JOB_ENQUEUE_FAILED",
                    event:
                        "analytics.job.enqueue_failed_after_request_log",
                    jobType: REQUEST_COMPLETED_JOB_TYPE,
                    orgId: input.orgId,
                    requestId: input.requestId,
                    userId: input.userId,
                },
                "Analytics job enqueue failed after RequestLog persistence",
            );
            await recordRecoveryFailureSafely(
                {
                    orgId: input.orgId,
                    requestId: input.requestId,
                    queueName: "analytics-queue",
                    jobType: REQUEST_COMPLETED_JOB_TYPE,
                },
                dependencies,
            );
        }

        if (messagePersistenceError !== undefined) {
            throw messagePersistenceError;
        }

    } finally {
        if (usagePersisted) {
            await input.reservation.markCompleted();
        }
    }
}

async function recordRecoveryFailureSafely(
    scope: EnqueueRecoveryScope,
    dependencies: ChatPipelineDependencies,
): Promise<void> {
    try {
        await dependencies.recordEnqueueFailure(scope);
    } catch {
        logger.error(
            {
                errorCode: "ENQUEUE_RECOVERY_RECORD_FAILED",
                event: "async.enqueue_recovery.record_failed",
                jobType: scope.jobType,
                orgId: scope.orgId,
                queue: scope.queueName,
                requestId: scope.requestId,
            },
            "Durable enqueue recovery record failed",
        );
    }
}

function normalizePreStreamError(error: unknown): AppError {
    if (error instanceof AppError) {
        return error;
    }

    return new AppError(
        503,
        "PROVIDER_UNAVAILABLE",
        "No provider response was available.",
    );
}
