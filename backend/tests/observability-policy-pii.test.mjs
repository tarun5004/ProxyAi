import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();

const [
    { emitPolicyDecisionEvent },
    { processPiiPromptImmutably },
    { metricsRegistry },
] = await Promise.all([
    import("../dist/features/policy/policy-events.js"),
    import("../dist/features/pii/pii-prompt-processor.js"),
    import("../dist/shared/observability/metrics.js"),
]);

beforeEach(() => {
    metricsRegistry.resetMetrics();
});

test("policy metrics count only canonical decision and reason labels", async () => {
    const rawSentinel = "policy-secret@example.test";

    emitPolicyDecisionEvent(
        {
            requestId: "8d34e98f-0c91-4304-893f-0615c884557f",
            decision: {
                action: "ALLOW_WITH_MASK",
                reasonCode: "mask_threshold_reached",
                providerPrompt: rawSentinel,
                riskScore: 10,
                categories: ["CONTACT_INFO"],
                detectorCount: 1,
            },
        },
        { info() {} },
    );

    const output = await metricsRegistry.metrics();

    assert.match(
        output,
        /proxiai_policy_decisions_total\{action="ALLOW_WITH_MASK",reason="mask_threshold_reached"\} 1/,
    );
    assert.equal(output.includes(rawSentinel), false);
    assert.equal(output.includes("requestId"), false);
});

test("PII metrics count final classified spans without values or offsets", async () => {
    const rawSentinel = "sentinel.person@example.test";

    processPiiPromptImmutably({
        prompt: `Contact ${rawSentinel} and use gsk_1234567890abcdefghijklmnop.`,
    });

    const output = await metricsRegistry.metrics();

    assert.match(
        output,
        /proxiai_pii_detections_total\{category="CONTACT_INFO"\} 1/,
    );
    assert.match(
        output,
        /proxiai_pii_detections_total\{category="CREDENTIAL"\} 1/,
    );
    assert.equal(output.includes(rawSentinel), false);
    assert.equal(output.includes("gsk_1234567890abcdefghijklmnop"), false);
    assert.equal(output.includes("start="), false);
    assert.equal(output.includes("end="), false);
});
