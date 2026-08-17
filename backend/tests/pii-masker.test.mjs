import assert from "node:assert/strict";
import test from "node:test";

const { classifyDetectedPii } = await import(
    "../dist/features/pii/pii-classifier.js"
);
const { detectPii } = await import(
    "../dist/features/pii/pii-detector.js"
);
const { maskClassifiedPii } = await import(
    "../dist/features/pii/pii-masker.js"
);

function classify(text) {
    return classifyDetectedPii(detectPii(text));
}

function span({ start, end, category, detector }) {
    return {
        start,
        end,
        category,
        detector,
        confidence: 0.9,
        metadata: {
            kind: detector,
            length: end - start,
        },
    };
}

test("masks one detected span and preserves surrounding text", () => {
    const text = "Email ada@example.com today.";
    const result = maskClassifiedPii(text, classify(text));

    assert.equal(result.maskedText, "Email [EMAIL_REDACTED] today.");
    assert.equal(JSON.stringify(result).includes("ada@example.com"), false);
    assert.deepEqual(result.masks[0], {
        sourceStart: 6,
        sourceEnd: 21,
        maskedStart: 6,
        maskedEnd: 22,
        placeholder: "[EMAIL_REDACTED]",
        categories: ["CONTACT_INFO"],
    });
});

test("masks multiple spans in source order", () => {
    const text = "Email ada@example.com; call +91 98765 43210 now.";
    const result = maskClassifiedPii(text, classify(text));

    assert.equal(
        result.maskedText,
        "Email [EMAIL_REDACTED]; call [PHONE_REDACTED] now.",
    );
    assert.deepEqual(
        result.masks.map(({ placeholder, categories }) => ({
            placeholder,
            categories,
        })),
        [
            {
                placeholder: "[EMAIL_REDACTED]",
                categories: ["CONTACT_INFO"],
            },
            {
                placeholder: "[PHONE_REDACTED]",
                categories: ["CONTACT_INFO"],
            },
        ],
    );
});

test("normalizes exact duplicates and overlapping spans deterministically", () => {
    const text = "Secret abcdefghij remains.";
    const credential = span({
        start: 7,
        end: 17,
        category: "CREDENTIAL",
        detector: "api_key",
    });
    const internalSecret = span({
        start: 10,
        end: 17,
        category: "INTERNAL_SECRET",
        detector: "connection_string",
    });
    const result = maskClassifiedPii(text, {
        spans: [internalSecret, credential, { ...credential }],
        categories: ["CREDENTIAL", "INTERNAL_SECRET"],
    });

    assert.equal(result.maskedText, "Secret [PII_REDACTED] remains.");
    assert.equal(result.masks.length, 1);
    assert.deepEqual(
        result.masks[0].categories,
        ["CREDENTIAL", "INTERNAL_SECRET"],
    );
});

test("does not mutate the original text or classified spans", () => {
    const text = "Email ada@example.com today.";
    const classification = classify(text);
    const originalClassification = structuredClone(classification);

    maskClassifiedPii(text, classification);

    assert.equal(text, "Email ada@example.com today.");
    assert.deepEqual(classification, originalClassification);
});
