import type {
    ClassifiedPiiSpan,
    PiiClassificationResult,
} from "./pii-classifier.js";
import {
    PII_CATEGORIES,
    type PiiCategory,
    type PiiDetectorId,
} from "./pii-detector.js";

const GENERIC_PLACEHOLDER = "[PII_REDACTED]";

const APPROVED_PLACEHOLDER_BY_DETECTOR: Readonly<
    Partial<Record<PiiDetectorId, string>>
> = Object.freeze({
    email: "[EMAIL_REDACTED]",
    phone: "[PHONE_REDACTED]",
    api_key: "[CREDENTIAL_REDACTED]",
} satisfies Partial<Record<PiiDetectorId, string>>);

export interface PiiMaskMetadata {
    readonly sourceStart: number;
    readonly sourceEnd: number;
    readonly maskedStart: number;
    readonly maskedEnd: number;
    readonly placeholder: string;
    readonly categories: readonly PiiCategory[];
}

export interface PiiMaskResult {
    readonly maskedText: string;
    readonly masks: readonly PiiMaskMetadata[];
}

interface MaskRange {
    readonly sourceStart: number;
    readonly sourceEnd: number;
    readonly placeholder: string;
    readonly categories: readonly PiiCategory[];
}

interface MaskRangeDraft {
    sourceStart: number;
    sourceEnd: number;
    spans: ClassifiedPiiSpan[];
}

export function maskClassifiedPii(
    text: string,
    classification: PiiClassificationResult,
): PiiMaskResult {
    const ranges = normalizeMaskRanges(text.length, classification.spans);
    let maskedText = text;

    for (const range of [...ranges].reverse()) {
        maskedText = maskedText.slice(0, range.sourceStart)
            + range.placeholder
            + maskedText.slice(range.sourceEnd);
    }

    let offsetDelta = 0;
    const masks = ranges.map((range) => {
        const maskedStart = range.sourceStart + offsetDelta;
        const maskedEnd = maskedStart + range.placeholder.length;

        offsetDelta += range.placeholder.length
            - (range.sourceEnd - range.sourceStart);

        return Object.freeze({
            sourceStart: range.sourceStart,
            sourceEnd: range.sourceEnd,
            maskedStart,
            maskedEnd,
            placeholder: range.placeholder,
            categories: range.categories,
        });
    });

    return Object.freeze({
        maskedText,
        masks: Object.freeze(masks),
    });
}

function normalizeMaskRanges(
    textLength: number,
    spans: readonly ClassifiedPiiSpan[],
): readonly MaskRange[] {
    const uniqueSpans = removeExactDuplicates(spans)
        .sort(compareSpans);
    const drafts: MaskRangeDraft[] = [];

    for (const span of uniqueSpans) {
        assertValidSpan(span, textLength);
        const current = drafts.at(-1);

        if (!current || current.sourceEnd <= span.start) {
            drafts.push({
                sourceStart: span.start,
                sourceEnd: span.end,
                spans: [span],
            });
            continue;
        }

        current.sourceEnd = Math.max(current.sourceEnd, span.end);
        current.spans.push(span);
    }

    return Object.freeze(drafts.map(finalizeRange));
}

function finalizeRange(draft: MaskRangeDraft): MaskRange {
    const firstSpan = draft.spans.at(0);

    if (!firstSpan) {
        throw new Error("Invalid empty PII mask range");
    }

    const categories = PII_CATEGORIES.filter((category) =>
        draft.spans.some((span) => span.category === category),
    );
    const placeholder = draft.spans.length === 1
        ? placeholderFor(firstSpan.detector)
        : GENERIC_PLACEHOLDER;

    return Object.freeze({
        sourceStart: draft.sourceStart,
        sourceEnd: draft.sourceEnd,
        placeholder,
        categories: Object.freeze(categories),
    });
}

function placeholderFor(detector: PiiDetectorId): string {
    return APPROVED_PLACEHOLDER_BY_DETECTOR[detector]
        ?? GENERIC_PLACEHOLDER;
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

function compareSpans(
    left: ClassifiedPiiSpan,
    right: ClassifiedPiiSpan,
): number {
    return left.start - right.start
        || right.end - left.end
        || left.category.localeCompare(right.category)
        || left.detector.localeCompare(right.detector);
}

function assertValidSpan(
    span: ClassifiedPiiSpan,
    textLength: number,
): void {
    if (
        !Number.isInteger(span.start)
        || !Number.isInteger(span.end)
        || span.start < 0
        || span.end <= span.start
        || span.end > textLength
    ) {
        throw new Error("Invalid PII mask span");
    }
}
