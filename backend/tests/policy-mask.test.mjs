import assert from "node:assert/strict";
import test from "node:test";

const { processPiiPromptImmutably } = await import(
    "../dist/features/pii/pii-prompt-processor.js"
);
const { calculatePiiRisk } = await import(
    "../dist/features/pii/pii-risk-scorer.js"
);
const { evaluateAllowWithMask } = await import(
    "../dist/features/policy/policy-evaluator.js"
);

function inputFor(request, thresholds = {
    maskThreshold: 10,
    blockThreshold: 60,
}) {
    const pii = processPiiPromptImmutably(request);

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

test("returns ALLOW_WITH_MASK for input inside the mask range", () => {
    const input = inputFor({
        prompt: "Email ada@example.com today.",
    });
    const firstDecision = evaluateAllowWithMask(input);
    const secondDecision = evaluateAllowWithMask(input);

    assert.equal(firstDecision?.action, "ALLOW_WITH_MASK");
    assert.equal(firstDecision?.reasonCode, "mask_threshold_reached");
    assert.deepEqual(firstDecision, secondDecision);
});

test("includes the exact mask-threshold boundary", () => {
    const decision = evaluateAllowWithMask(inputFor(
        {
            prompt: "Email ada@example.com today.",
        },
        {
            maskThreshold: 10,
            blockThreshold: 60,
        },
    ));

    assert.equal(decision?.riskScore, 10);
    assert.equal(decision?.action, "ALLOW_WITH_MASK");
});

test("returns the sanitized provider prompt without raw PII", () => {
    const sensitiveValue = "ada@example.com";
    const decision = evaluateAllowWithMask(inputFor({
        prompt: `Email ${sensitiveValue} today.`,
    }));

    assert.equal(
        decision?.providerPrompt,
        "Email [EMAIL_REDACTED] today.",
    );
    assert.equal(JSON.stringify(decision).includes(sensitiveValue), false);
});

test("does not mutate the original request", () => {
    const request = {
        prompt: "Email ada@example.com today.",
        metadata: {
            clientRequestId: "6d49a0bd-6149-44ac-a1f9-47aa1ac746bb",
        },
    };
    const originalRequest = structuredClone(request);

    evaluateAllowWithMask(inputFor(request));

    assert.deepEqual(request, originalRequest);
});
