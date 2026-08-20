import type { AuthContext } from "../auth/auth-context.types.js";
import type { PiiCategory } from "../pii/pii-detector.js";
import { logger } from "../../shared/lib/logger.js";
import {
    APPROVED_METRIC_LABEL_VALUES,
    metrics,
    requireApprovedMetricLabel,
} from "../../shared/observability/metrics.js";
import type {
    PolicyAction,
    PolicyDecision,
} from "./policy.types.js";

export const POLICY_DECISION_EVENT_NAMES = {
    ALLOW: "policy.allow",
    ALLOW_WITH_MASK: "policy.mask",
    BLOCK: "policy.block",
    BUDGET_BLOCK: "policy.budget_block",
} as const;

export type PolicyDecisionEventName =
    (typeof POLICY_DECISION_EVENT_NAMES)[keyof typeof POLICY_DECISION_EVENT_NAMES];

export interface PolicyDecisionEvent {
    readonly event: PolicyDecisionEventName;
    readonly requestId: string;
    readonly decision: PolicyAction;
    readonly riskScore: number;
    readonly reasonCode: PolicyDecision["reasonCode"];
    readonly categories: readonly PiiCategory[];
    readonly detectorCount: number;
    readonly orgId?: string;
    readonly userId?: string;
}

export interface PolicyDecisionEventInput {
    readonly requestId: string;
    readonly decision: PolicyDecision;
    readonly auth?: Readonly<AuthContext>;
}

interface PolicyEventLogger {
    info(event: PolicyDecisionEvent, message: string): void;
}

export function createPolicyDecisionEvent(
    input: PolicyDecisionEventInput,
): PolicyDecisionEvent {
    const event = {
        event: resolvePolicyEventName(input.decision),
        requestId: input.requestId,
        decision: input.decision.action,
        riskScore: input.decision.riskScore,
        reasonCode: input.decision.reasonCode,
        categories: Object.freeze([...input.decision.categories]),
        detectorCount: input.decision.detectorCount,
        ...(input.auth
            ? {
                orgId: input.auth.orgId,
                userId: input.auth.userId,
            }
            : {}),
    } satisfies PolicyDecisionEvent;

    return Object.freeze(event);
}

export function emitPolicyDecisionEvent(
    input: PolicyDecisionEventInput,
    log: PolicyEventLogger = logger,
): PolicyDecisionEvent {
    const event = createPolicyDecisionEvent(input);

    metrics.policyDecisionsTotal.inc({
        action: requireApprovedMetricLabel(
            "policy action",
            event.decision,
            APPROVED_METRIC_LABEL_VALUES.policyActions,
        ),
        reason: requireApprovedMetricLabel(
            "policy reason",
            event.reasonCode,
            APPROVED_METRIC_LABEL_VALUES.policyReasons,
        ),
    });

    log.info(event, "Policy decision evaluated");

    return event;
}

function resolvePolicyEventName(
    decision: PolicyDecision,
): PolicyDecisionEventName {
    if (
        decision.action === "BLOCK"
        && decision.reasonCode === "budget_exceeded"
    ) {
        return POLICY_DECISION_EVENT_NAMES.BUDGET_BLOCK;
    }

    return POLICY_DECISION_EVENT_NAMES[decision.action];
}
