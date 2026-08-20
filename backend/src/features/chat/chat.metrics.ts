import {
    APPROVED_METRIC_LABEL_VALUES,
    metrics,
    requireApprovedMetricLabel,
} from "../../shared/observability/metrics.js";
import type { PolicyAction } from "../policy/policy.types.js";
import type { ProviderId } from "../providers/provider.types.js";

type AcceptedPolicyAction = Exclude<PolicyAction, "BLOCK">;
type ChatTerminalOutcome = "COMPLETED" | "FAILED" | "INTERRUPTED";

export interface ChatExecutionMetrics {
    readonly finish: (outcome: ChatTerminalOutcome) => void;
    readonly markProviderStarted: (providerId: ProviderId) => void;
    readonly observeFirstToken: () => void;
}

export function recordBlockedChat(): void {
    metrics.chatRequestsTotal.inc({
        outcome: "BLOCKED",
        policy_action: "BLOCK",
    });
}

export function startAcceptedChatMetrics(
    policyAction: AcceptedPolicyAction,
): ChatExecutionMetrics {
    const acceptedAt = process.hrtime.bigint();
    const approvedPolicyAction = requireApprovedMetricLabel(
        "policy action",
        policyAction,
        APPROVED_METRIC_LABEL_VALUES.policyActions,
    );
    let provider: ProviderId | undefined;
    let providerStartedAt: bigint | undefined;
    let firstTokenObserved = false;
    let terminalObserved = false;

    return Object.freeze({
        finish(outcome: ChatTerminalOutcome) {
            if (terminalObserved) {
                return;
            }

            terminalObserved = true;
            const approvedOutcome = requireApprovedMetricLabel(
                "chat outcome",
                outcome,
                APPROVED_METRIC_LABEL_VALUES.chatOutcomes,
            );

            metrics.chatRequestsTotal.inc({
                outcome: approvedOutcome,
                policy_action: approvedPolicyAction,
            });
            metrics.chatCompletionDurationSeconds.observe(
                { outcome: approvedOutcome },
                elapsedSeconds(acceptedAt),
            );
        },
        markProviderStarted(providerId: ProviderId) {
            if (providerStartedAt !== undefined) {
                return;
            }

            provider = requireApprovedMetricLabel(
                "provider",
                providerId,
                APPROVED_METRIC_LABEL_VALUES.providers,
            );
            providerStartedAt = process.hrtime.bigint();
        },
        observeFirstToken() {
            if (
                firstTokenObserved
                || provider === undefined
                || providerStartedAt === undefined
            ) {
                return;
            }

            firstTokenObserved = true;
            metrics.chatTimeToFirstTokenSeconds.observe(
                { provider },
                elapsedSeconds(providerStartedAt),
            );
        },
    });
}

function elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}
