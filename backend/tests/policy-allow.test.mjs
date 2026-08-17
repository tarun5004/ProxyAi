import assert from "node:assert/strict";
import test from "node:test";

const { processPiiPromptImmutably } = await import(
    "../dist/features/pii/pii-prompt-processor.js"
);
const { calculatePiiRisk } = await import(
    "../dist/features/pii/pii-risk-scorer.js"
);
const { evaluateAllow } = await import(
    "../dist/features/policy/policy-evaluator.js"
);

function inputFor(prompt, thresholds = {
    maskThreshold: 20,
    blockThreshold: 60,
}) {
    const pii = processPiiPromptImmutably({ prompt });

    return {
        pii,
        risk: calculatePiiRisk(pii.classification),
        budget: {
            monthlyBudgetTokens: 10_000,
            usedTokens: 1_000,
            remainingTokens: 9_000,
            remainingPercent: 90,
            exceeded: false,
        },
        thresholds,
    };
}

test("returns ALLOW for safe input below the mask threshold", () => {
    const decision = evaluateAllow(inputFor("Explain immutable data."));

    assert.deepEqual(decision, {
        action: "ALLOW",
        reasonCode: "risk_below_mask_threshold",
        riskScore: 0,
        categories: [],
        detectorCount: 0,
    });
});

test("allows below the boundary but not at the mask threshold", () => {
    const belowBoundary = evaluateAllow(inputFor(
        "Email ada@example.com today.",
        {
            maskThreshold: 11,
            blockThreshold: 60,
        },
    ));
    const atBoundary = evaluateAllow(inputFor(
        "Email ada@example.com today.",
        {
            maskThreshold: 10,
            blockThreshold: 60,
        },
    ));

    assert.equal(belowBoundary?.action, "ALLOW");
    assert.equal(atBoundary, null);
});

test("returns the same decision for the same policy input", () => {
    const input = inputFor("Explain immutable data.");

    assert.deepEqual(evaluateAllow(input), evaluateAllow(input));
});

test("returns only safe metadata without the detected value", () => {
    const sensitiveValue = "ada@example.com";
    const decision = evaluateAllow(inputFor(
        `Email ${sensitiveValue} today.`,
        {
            maskThreshold: 20,
            blockThreshold: 60,
        },
    ));
    const serializedDecision = JSON.stringify(decision);

    assert.equal(decision?.action, "ALLOW");
    assert.equal(serializedDecision.includes(sensitiveValue), false);
    assert.equal(Object.isFrozen(decision), true);
    assert.equal(Object.isFrozen(decision?.categories), true);
});
