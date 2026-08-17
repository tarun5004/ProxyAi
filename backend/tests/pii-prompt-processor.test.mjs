import assert from "node:assert/strict";
import test from "node:test";

const { processPiiPromptImmutably } = await import(
    "../dist/features/pii/pii-prompt-processor.js"
);

test("keeps the original prompt unchanged after detection", () => {
    const request = {
        prompt: "Email ada@example.com today.",
    };

    const result = processPiiPromptImmutably(request);

    assert.equal(request.prompt, "Email ada@example.com today.");
    assert.equal(result.detection.spans.length, 1);
});

test("keeps the original prompt unchanged after masking", () => {
    const request = {
        prompt: "Call +91 98765 43210 now.",
    };

    const result = processPiiPromptImmutably(request);

    assert.equal(request.prompt, "Call +91 98765 43210 now.");
    assert.equal(result.masking.maskedText, "Call [PHONE_REDACTED] now.");
});

test("does not mutate or forward nested request objects", () => {
    const request = {
        prompt: "Email ada@example.com today.",
        messages: [
            {
                role: "user",
                content: "Existing non-sensitive context",
                metadata: {
                    sequence: 1,
                },
            },
        ],
        options: {
            routingMode: "auto",
        },
    };
    const originalRequest = structuredClone(request);

    const result = processPiiPromptImmutably(request);

    assert.deepEqual(request, originalRequest);
    assert.equal("messages" in result.sanitizedRequest, false);
    assert.equal("options" in result.sanitizedRequest, false);
});

test("returns a separate frozen request containing the masked prompt", () => {
    const request = {
        prompt: "Email ada@example.com today.",
    };
    const result = processPiiPromptImmutably(request);

    assert.notEqual(result.sanitizedRequest, request);
    assert.deepEqual(result.sanitizedRequest, {
        prompt: "Email [EMAIL_REDACTED] today.",
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.detection), true);
    assert.equal(Object.isFrozen(result.sanitizedRequest), true);
    assert.equal(
        JSON.stringify(result.sanitizedRequest).includes("ada@example.com"),
        false,
    );
});
