import assert from "node:assert/strict";
import test from "node:test";

const {
    createPolicyDecisionEvent,
    emitPolicyDecisionEvent,
} = await import("../dist/features/policy/policy-events.js");

const requestId = "c840f177-8a50-4bb0-8d2b-798e61566a46";

test("creates a safe ALLOW event", () => {
    const event = createPolicyDecisionEvent({
        requestId,
        decision: {
            action: "ALLOW",
            reasonCode: "risk_below_mask_threshold",
            riskScore: 0,
            categories: [],
            detectorCount: 0,
        },
    });

    assert.deepEqual(event, {
        event: "policy.allow",
        requestId,
        decision: "ALLOW",
        riskScore: 0,
        reasonCode: "risk_below_mask_threshold",
        categories: [],
        detectorCount: 0,
    });
});

test("emits a safe MASK event with only trusted actor identifiers", () => {
    const sensitiveSentinel = "raw-secret@example.com";
    const logged = [];
    const event = emitPolicyDecisionEvent(
        {
            requestId,
            decision: {
                action: "ALLOW_WITH_MASK",
                reasonCode: "mask_threshold_reached",
                providerPrompt: sensitiveSentinel,
                riskScore: 10,
                categories: ["CONTACT_INFO"],
                detectorCount: 1,
            },
            auth: {
                orgId: "98cdb610-483d-4e7d-9719-d19947149236",
                userId: "79504f4f-9337-48a9-94b6-d727a15eeb31",
                role: "EMPLOYEE",
                permissions: ["chat:send"],
                sessionId: "b6456c67-4b3c-4bf6-bd90-f7c4008307e2",
            },
        },
        {
            info(data, message) {
                logged.push({ data, message });
            },
        },
    );

    assert.equal(event.event, "policy.mask");
    assert.equal(event.orgId, "98cdb610-483d-4e7d-9719-d19947149236");
    assert.equal(event.userId, "79504f4f-9337-48a9-94b6-d727a15eeb31");
    assert.equal("providerPrompt" in event, false);
    assert.equal("role" in event, false);
    assert.equal("permissions" in event, false);
    assert.equal("sessionId" in event, false);
    assert.equal(JSON.stringify(logged).includes(sensitiveSentinel), false);
});

test("creates a safe high-risk BLOCK event", () => {
    const event = createPolicyDecisionEvent({
        requestId,
        decision: {
            action: "BLOCK",
            reasonCode: "high_risk_pii",
            riskScore: 70,
            categories: ["CREDENTIAL", "INTERNAL_SECRET"],
            detectorCount: 2,
        },
    });

    assert.equal(event.event, "policy.block");
    assert.equal(event.decision, "BLOCK");
    assert.deepEqual(event.categories, ["CREDENTIAL", "INTERNAL_SECRET"]);
    assert.equal(event.detectorCount, 2);
});

test("uses the approved budget BLOCK event with safe metadata", () => {
    const event = createPolicyDecisionEvent({
        requestId,
        decision: {
            action: "BLOCK",
            reasonCode: "budget_exceeded",
            riskScore: 0,
            categories: [],
            detectorCount: 0,
        },
    });

    assert.deepEqual(event, {
        event: "policy.budget_block",
        requestId,
        decision: "BLOCK",
        riskScore: 0,
        reasonCode: "budget_exceeded",
        categories: [],
        detectorCount: 0,
    });
});
