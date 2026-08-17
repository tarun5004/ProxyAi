import type { OrganisationPolicy } from "../organisations/organisation.types.js";
import type { PiiPromptProcessingResult } from "../pii/pii-prompt-processor.js";
import type { PiiRiskAssessment } from "../pii/pii-risk-scorer.js";
import type { PiiCategory } from "../pii/pii-detector.js";

export const POLICY_ACTIONS = [
    "ALLOW",
    "ALLOW_WITH_MASK",
    "BLOCK",
] as const;

export const ALLOW_REASON_CODES = [
    "risk_below_mask_threshold",
] as const;

export type PolicyAction = (typeof POLICY_ACTIONS)[number];
export type AllowReasonCode = (typeof ALLOW_REASON_CODES)[number];

export interface BudgetStatus {
    readonly monthlyBudgetTokens: number;
    readonly usedTokens: number;
    readonly remainingTokens: number;
    readonly remainingPercent: number;
    readonly exceeded: boolean;
}

export interface PolicyEvaluationInput {
    readonly pii: PiiPromptProcessingResult;
    readonly risk: PiiRiskAssessment;
    readonly budget: BudgetStatus;
    readonly thresholds: Readonly<OrganisationPolicy>;
}

export interface AllowPolicyDecision {
    readonly action: "ALLOW";
    readonly reasonCode: AllowReasonCode;
    readonly riskScore: number;
    readonly categories: readonly PiiCategory[];
    readonly detectorCount: number;
}

export type PolicyDecision = AllowPolicyDecision;
