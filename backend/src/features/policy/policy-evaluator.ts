import type {
    AllowPolicyDecision,
    PolicyEvaluationInput,
} from "./policy.types.js";

export function evaluateAllow(
    input: PolicyEvaluationInput,
): AllowPolicyDecision | null {
    assertValidEvaluationInput(input);

    if (
        input.budget.exceeded
        || input.risk.score >= input.thresholds.maskThreshold
    ) {
        return null;
    }

    return Object.freeze({
        action: "ALLOW",
        reasonCode: "risk_below_mask_threshold",
        riskScore: input.risk.score,
        categories: Object.freeze([
            ...input.pii.classification.categories,
        ]),
        detectorCount: input.pii.classification.spans.length,
    });
}

function assertValidEvaluationInput(
    input: PolicyEvaluationInput,
): void {
    const { blockThreshold, maskThreshold } = input.thresholds;

    if (
        !Number.isInteger(maskThreshold)
        || !Number.isInteger(blockThreshold)
        || maskThreshold < 0
        || blockThreshold > 100
        || blockThreshold <= maskThreshold
        || !Number.isInteger(input.risk.score)
        || input.risk.score < 0
        || input.risk.score > 100
    ) {
        throw new Error("Invalid policy evaluation input");
    }
}
