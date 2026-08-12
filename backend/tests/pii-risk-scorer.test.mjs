import assert from "node:assert/strict";
import test from "node:test";

const { calculatePiiRisk } = await import(
    "../dist/features/pii/pii-risk-scorer.js"
);

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

function classification(spans) {
    return {
        spans,
        categories: [...new Set(spans.map((item) => item.category))],
    };
}

test("scores one category with an explainable contribution", () => {
    const result = calculatePiiRisk(classification([
        span({
            start: 0,
            end: 15,
            category: "CONTACT_INFO",
            detector: "email",
        }),
    ]));

    assert.deepEqual(result, {
        score: 10,
        uncappedScore: 10,
        capped: false,
        contributions: [{
            category: "CONTACT_INFO",
            weight: 10,
            spanCount: 1,
            subtotal: 10,
        }],
    });
});

test("adds weights across multiple canonical categories", () => {
    const result = calculatePiiRisk(classification([
        span({
            start: 0,
            end: 15,
            category: "CONTACT_INFO",
            detector: "email",
        }),
        span({
            start: 20,
            end: 39,
            category: "FINANCIAL",
            detector: "payment_card_luhn",
        }),
        span({
            start: 45,
            end: 55,
            category: "GOVERNMENT_ID",
            detector: "government_id",
        }),
    ]));

    assert.equal(result.score, 65);
    assert.deepEqual(
        result.contributions.map(({ category, subtotal }) => ({
            category,
            subtotal,
        })),
        [
            { category: "CONTACT_INFO", subtotal: 10 },
            { category: "FINANCIAL", subtotal: 25 },
            { category: "GOVERNMENT_ID", subtotal: 30 },
        ],
    );
});

test("counts distinct spans but ignores an exact duplicate", () => {
    const first = span({
        start: 0,
        end: 15,
        category: "CONTACT_INFO",
        detector: "email",
    });
    const second = span({
        start: 20,
        end: 35,
        category: "CONTACT_INFO",
        detector: "email",
    });
    const result = calculatePiiRisk(classification([
        first,
        second,
        { ...first },
    ]));

    assert.equal(result.score, 20);
    assert.equal(result.contributions[0].spanCount, 2);
    assert.equal(result.contributions[0].subtotal, 20);
});

test("caps the normalized score at 100", () => {
    const result = calculatePiiRisk(classification([
        span({
            start: 0,
            end: 20,
            category: "CREDENTIAL",
            detector: "api_key",
        }),
        span({
            start: 25,
            end: 45,
            category: "CREDENTIAL",
            detector: "api_key",
        }),
        span({
            start: 50,
            end: 70,
            category: "CREDENTIAL",
            detector: "api_key",
        }),
    ]));

    assert.equal(result.score, 100);
    assert.equal(result.uncappedScore, 120);
    assert.equal(result.capped, true);
});
