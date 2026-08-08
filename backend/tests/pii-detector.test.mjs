import assert from "node:assert/strict";
import test from "node:test";

const { detectPii } = await import(
    "../dist/features/pii/pii-detector.js"
);

function spanFor(text, value) {
    const start = text.indexOf(value);

    assert.notEqual(start, -1);

    return {
        start,
        end: start + value.length,
    };
}

test("PII detector finds email and phone with exact offsets", () => {
    const text = "Contact ada@example.com or +91 98765 43210 today.";
    const result = detectPii(text);

    assert.deepEqual(
        result.spans.map((span) => ({
            detector: span.detector,
            category: span.category,
            start: span.start,
            end: span.end,
        })),
        [
            {
                detector: "email",
                category: "CONTACT_INFO",
                ...spanFor(text, "ada@example.com"),
            },
            {
                detector: "phone",
                category: "CONTACT_INFO",
                ...spanFor(text, "+91 98765 43210"),
            },
        ],
    );
    assert.deepEqual(result.categories, ["CONTACT_INFO"]);
});

test("PII detector finds credential-like values without raw metadata", () => {
    const text = "Set api_key=gsk_abcdefghijklmnopqrstuvwxyz123456.";
    const result = detectPii(text);

    assert.equal(result.spans.length, 1);
    assert.equal(result.spans[0].detector, "api_key");
    assert.equal(result.spans[0].category, "CREDENTIAL");
    assert.deepEqual(result.spans[0].metadata, {
        kind: "api_key",
        length: spanFor(
            text,
            "api_key=gsk_abcdefghijklmnopqrstuvwxyz123456",
        ).end - spanFor(
            text,
            "api_key=gsk_abcdefghijklmnopqrstuvwxyz123456",
        ).start,
    });
    assert.equal(
        JSON.stringify(result),
        JSON.stringify(result).includes(
            "gsk_abcdefghijklmnopqrstuvwxyz123456",
        )
            ? "contains-secret"
            : JSON.stringify(result),
    );
});

test("PII detector prefers connection string over nested email or phone", () => {
    const text =
        "Use mongodb://user@example.com:pass@127.0.0.1:27017/db";
    const result = detectPii(text);

    assert.deepEqual(
        result.spans.map((span) => span.detector),
        ["connection_string"],
    );
    assert.deepEqual(
        {
            start: result.spans[0].start,
            end: result.spans[0].end,
        },
        spanFor(
            text,
            "mongodb://user@example.com:pass@127.0.0.1:27017/db",
        ),
    );
});

test("PII detector preserves exact offsets for card and government ID", () => {
    const text = "Card 4111 1111 1111 1111; PAN ABCDE1234F.";
    const result = detectPii(text);

    assert.deepEqual(
        result.spans.map((span) => ({
            detector: span.detector,
            start: span.start,
            end: span.end,
            normalizedLength: span.metadata.normalizedLength,
        })),
        [
            {
                detector: "payment_card_luhn",
                ...spanFor(text, "4111 1111 1111 1111"),
                normalizedLength: 16,
            },
            {
                detector: "government_id",
                ...spanFor(text, "ABCDE1234F"),
                normalizedLength: undefined,
            },
        ],
    );
});
