import assert from "node:assert/strict";
import test from "node:test";

const { classifyDetectedPii } = await import(
    "../dist/features/pii/pii-classifier.js"
);
const { detectPii } = await import(
    "../dist/features/pii/pii-detector.js"
);

function classify(text) {
    return classifyDetectedPii(detectPii(text));
}

test("classifies email and phone as contact information deterministically", () => {
    const text = "Contact ada@example.com or +91 98765 43210.";
    const firstResult = classify(text);
    const secondResult = classify(text);

    assert.deepEqual(firstResult, secondResult);
    assert.deepEqual(firstResult.categories, ["CONTACT_INFO"]);
    assert.deepEqual(
        firstResult.spans.map(({ detector, category, start, end }) => ({
            detector,
            category,
            start,
            end,
        })),
        [
            {
                detector: "email",
                category: "CONTACT_INFO",
                start: text.indexOf("ada@example.com"),
                end: text.indexOf("ada@example.com") + "ada@example.com".length,
            },
            {
                detector: "phone",
                category: "CONTACT_INFO",
                start: text.indexOf("+91 98765 43210"),
                end: text.indexOf("+91 98765 43210") + "+91 98765 43210".length,
            },
        ],
    );
});

test("classifies a payment card as financial information", () => {
    const result = classify("Card 4111 1111 1111 1111.");

    assert.deepEqual(result.categories, ["FINANCIAL"]);
    assert.equal(result.spans[0].category, "FINANCIAL");
});

test("classifies API keys and connection strings without raw values", () => {
    const apiKey = "gsk_abcdefghijklmnopqrstuvwxyz123456";
    const connectionString = "redis://user:secret@localhost:6379";
    const result = classify(`Use ${apiKey} and ${connectionString}`);
    const serializedResult = JSON.stringify(result);

    assert.deepEqual(result.categories, ["CREDENTIAL", "INTERNAL_SECRET"]);
    assert.equal(serializedResult.includes(apiKey), false);
    assert.equal(serializedResult.includes(connectionString), false);
});

test("classifies selected government IDs and preserves offsets", () => {
    const text = "PAN ABCDE1234F requires review.";
    const value = "ABCDE1234F";
    const result = classify(text);

    assert.deepEqual(result.categories, ["GOVERNMENT_ID"]);
    assert.deepEqual(
        {
            start: result.spans[0].start,
            end: result.spans[0].end,
            category: result.spans[0].category,
        },
        {
            start: text.indexOf(value),
            end: text.indexOf(value) + value.length,
            category: "GOVERNMENT_ID",
        },
    );
});
