import type {
    ClassifiedPiiSpan,
    PiiClassificationResult,
} from "./pii-classifier.js";
import {
    PII_CATEGORIES,
    type PiiCategory,
} from "./pii-detector.js";

export const PII_CATEGORY_WEIGHTS = Object.freeze({
    CONTACT_INFO: 10,
    FINANCIAL: 25,
    GOVERNMENT_ID: 30,
    CREDENTIAL: 40,
    INTERNAL_SECRET: 40,
    BUSINESS_CONFIDENTIAL: 20,
} satisfies Record<PiiCategory, number>);

export interface PiiRiskContribution {
    readonly category: PiiCategory;
    readonly weight: number;
    readonly spanCount: number;
    readonly subtotal: number;
}

export interface PiiRiskAssessment {
    readonly score: number;
    readonly uncappedScore: number;
    readonly capped: boolean;
    readonly contributions: readonly PiiRiskContribution[];
}

export function calculatePiiRisk(
    classification: PiiClassificationResult,
): PiiRiskAssessment {
    const uniqueSpans = removeExactDuplicates(classification.spans);
    const spanCounts = countSpansByCategory(uniqueSpans);
    const contributions = PII_CATEGORIES.flatMap((category) => {
        const spanCount = spanCounts.get(category) ?? 0;

        if (spanCount === 0) {
            return [];
        }

        const weight = PII_CATEGORY_WEIGHTS[category];

        return [Object.freeze({
            category,
            weight,
            spanCount,
            subtotal: weight * spanCount,
        })];
    });
    const uncappedScore = contributions.reduce(
        (total, contribution) => total + contribution.subtotal,
        0,
    );

    return Object.freeze({
        score: Math.min(100, uncappedScore),
        uncappedScore,
        capped: uncappedScore > 100,
        contributions: Object.freeze(contributions),
    });
}

function removeExactDuplicates(
    spans: readonly ClassifiedPiiSpan[],
): ClassifiedPiiSpan[] {
    const seen = new Set<string>();

    return spans.filter((span) => {
        const key = [
            span.start,
            span.end,
            span.category,
            span.detector,
        ].join(":");

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function countSpansByCategory(
    spans: readonly ClassifiedPiiSpan[],
): ReadonlyMap<PiiCategory, number> {
    const counts = new Map<PiiCategory, number>();

    for (const span of spans) {
        counts.set(span.category, (counts.get(span.category) ?? 0) + 1);
    }

    return counts;
}
