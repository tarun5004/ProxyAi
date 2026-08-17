import assert from "node:assert/strict";
import test from "node:test";

const { processPiiPromptImmutably } = await import(
    "../dist/features/pii/pii-prompt-processor.js"
);
const { calculatePiiRisk } = await import(
    "../dist/features/pii/pii-risk-scorer.js"
);
const { evaluateBlock } = await import(
    "../dist/features/policy/policy-evaluator.js"
);

function inputFor(request, options = {}) {
    const pii = processPiiPromptImmutably(request);

    return {
        pii,
        risk: calculatePiiRisk(pii.classification),
        budget: {
            monthlyBudgetTokens: 10_000,
            usedTokens: options.budgetExceeded ? 10_000 : 1_000,
            remainingTokens: options.budgetExceeded ? 0 : 9_000,
            remainingPercent: options.budgetExceeded ? 0 : 90,
            exceeded: options.budgetExceeded ?? false,
        },
        thresholds: options.thresholds ?? {
            maskThreshold: 20,
            blockThreshold: 40,
        },
    };
}

test("blocks deterministically at the exact block threshold", () => {
    const input = inputFor({
        prompt: "Use api_key=gsk_abcdefghijklmnopqrstuvwxyz123456.",
    });
    const firstDecision = evaluateBlock(input);
    const secondDecision = evaluateBlock(input);

    assert.equal(firstDecision?.riskScore, 40);
    assert.equal(firstDecision?.reasonCode, "high_risk_pii");
    assert.deepEqual(firstDecision, secondDecision);
});

test("blocks when risk is above the block threshold", () => {
    const decision = evaluateBlock(inputFor({
        prompt: "Email ada@example.com; use api_key=gsk_abcdefghijklmnopqrstuvwxyz123456.",
    }));

    assert.equal(decision?.riskScore, 50);
    assert.equal(decision?.action, "BLOCK");
});

test("blocks an exhausted budget before risk evaluation", () => {
    const decision = evaluateBlock(inputFor(
        {
            prompt: "Explain immutable data.",
        },
        {
            budgetExceeded: true,
        },
    ));

    assert.equal(decision?.riskScore, 0);
    assert.equal(decision?.reasonCode, "budget_exceeded");
});

test("returns no provider prompt or raw sensitive data and keeps input unchanged", () => {
    const sensitiveValue = "gsk_abcdefghijklmnopqrstuvwxyz123456";
    const request = {
        prompt: `Use api_key=${sensitiveValue}.`,
        metadata: {
            clientRequestId: "6d49a0bd-6149-44ac-a1f9-47aa1ac746bb",
        },
    };
    const originalRequest = structuredClone(request);
    const decision = evaluateBlock(inputFor(request));
    const serializedDecision = JSON.stringify(decision);

    assert.deepEqual(request, originalRequest);
    assert.equal("providerPrompt" in decision, false);
    assert.equal(serializedDecision.includes(sensitiveValue), false);
});
