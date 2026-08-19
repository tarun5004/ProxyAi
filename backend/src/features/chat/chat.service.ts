import { env } from "../../config/env.js";
import {
    ASYNC_JOB_SCHEMA_VERSION,
    REQUEST_COMPLETED_JOB_TYPE,
} from "../../shared/async/job-contract.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
    createIdempotencyRequestFingerprint,
    idempotencyService,
    type IdempotencyReservation,
    type IdempotencyService,
} from "../../shared/idempotency/idempotency.service.js";
import { logger } from "../../shared/lib/logger.js";
import type { AuthContext } from "../auth/auth-context.types.js";
import { enqueueRequestCompletedJob } from "../billing/billing.queue.js";
import {
    appendRequestUsage,
    readAuthoritativeBudgetStatus,
} from "../billing/billing.service.js";
import { getConversationForOwner } from "../conversations/conversation.service.js";
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
import { createGroqProviderAdapter } from "../providers/groq-provider.adapter.js";
import type {
    CompletionRequest,
    StreamChunk,
    TokenUsage,
} from "../providers/provider.types.js";
import {
    chatControlService,
    type ChatControlService,
} from "./chat-control.service.js";
import {
    loadChatOrganisationContext,
    type ChatOrganisationContext,
} from "./chat.repository.js";
import type { ChatStreamRequest } from "./chat.schema.js";

const groqAdapter = createGroqProviderAdapter();
const productionCandidates = Object.freeze([
    Object.freeze({
        adapter: groqAdapter,
        model: env.GROQ_MODEL,
    }),
]);

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
    readonly candidates: readonly ProviderFallbackCandidate[];
    readonly streamProvider: typeof streamWithOrderedFallback;
    readonly appendUsage: typeof appendRequestUsage;
    readonly enqueueBillingJob: typeof enqueueRequestCompletedJob;
    readonly reconcileBudget: (
        orgId: string,
    ) => Promise<Readonly<BudgetStatus>>;
    readonly emitPolicyEvent: typeof emitPolicyDecisionEvent;
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
}

export const defaultChatPipelineDependencies: ChatPipelineDependencies = {
    assertConversationOwner: getConversationForOwner,
    loadOrganisationContext: loadChatOrganisationContext,
    controls: chatControlService,
    idempotency: idempotencyService,
    readBudgetStatus: readAuthoritativeBudgetStatus,
    processPrompt: processPiiPromptImmutably,
    candidates: productionCandidates,
    streamProvider: streamWithOrderedFallback,
    appendUsage: appendRequestUsage,
    enqueueBillingJob: enqueueRequestCompletedJob,
    reconcileBudget: readAuthoritativeBudgetStatus,
    emitPolicyEvent: emitPolicyDecisionEvent,
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

        if (decision.action === "BLOCK") {
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
        const candidate = selectProductionCandidate(
            input.request,
            dependencies.candidates,
        );
        const fallbackEvents: ProviderFallbackEvent[] = [];
        const providerStream = dependencies.streamProvider(
            {
                requestId: input.requestId,
                messages: Object.freeze([
                    Object.freeze({
                        role: "user" as const,
                        content: approvedPrompt,
                    }),
                ]),
                maxOutputTokens:
                    candidate.adapter.getCapabilities().maxOutputTokens,
                abortSignal: input.abortSignal,
            },
            [candidate],
            {
                recordEvent: (event) => {
                    fallbackEvents.push(Object.freeze({ ...event }));
                },
            },
        );
        const iterator = providerStream[Symbol.asyncIterator]();

        reservation.markProviderExecutionStarted();
        providerStarted = true;
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
        };
    } catch (error: unknown) {
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
                    undefined,
                    dependencies,
                );
            } else {
                await reservation.releaseBeforeExecution();
            }
        }

        throw normalizePreStreamError(error);
    }
}

export async function finalizeChatStream(
    prepared: PreparedChatStream,
    usage: Readonly<TokenUsage> | undefined,
    dependencies: ChatPipelineDependencies = defaultChatPipelineDependencies,
): Promise<void> {
    await recordUsageAndComplete(prepared, usage, dependencies);
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

function selectProductionCandidate(
    request: Readonly<ChatStreamRequest>,
    candidates: readonly ProviderFallbackCandidate[],
): ProviderFallbackCandidate {
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
    usage: Readonly<TokenUsage> | undefined,
    dependencies: ChatPipelineDependencies,
): Promise<void> {
    try {
        await dependencies.appendUsage({
            requestId: input.requestId,
            orgId: input.orgId,
            userId: input.userId,
            providerId: input.providerId,
            model: input.model,
            ...(usage === undefined ? {} : { usage }),
        });

        try {
            await dependencies.enqueueBillingJob({
                schemaVersion: ASYNC_JOB_SCHEMA_VERSION,
                jobType: REQUEST_COMPLETED_JOB_TYPE,
                requestId: input.requestId,
                orgId: input.orgId,
                userId: input.userId,
                providerId: input.providerId,
                model: input.model,
                ...(usage === undefined ? {} : { usage }),
                occurredAt: new Date().toISOString(),
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
        }

        if (usage !== undefined) {
            await dependencies.reconcileBudget(input.orgId);
        }
    } finally {
        await input.reservation.markCompleted();
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
