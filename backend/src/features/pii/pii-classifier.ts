import type {
    DetectedPiiSpan,
    PiiCategory,
    PiiDetectionResult,
    PiiDetectorId,
    PiiSafeMetadata,
} from "./pii-detector.js";

const CATEGORY_BY_DETECTOR = Object.freeze({
    email: "CONTACT_INFO",
    phone: "CONTACT_INFO",
    payment_card_luhn: "FINANCIAL",
    government_id: "GOVERNMENT_ID",
    api_key: "CREDENTIAL",
    connection_string: "INTERNAL_SECRET",
} satisfies Record<PiiDetectorId, PiiCategory>);

export interface ClassifiedPiiSpan {
    readonly start: number;
    readonly end: number;
    readonly category: PiiCategory;
    readonly detector: PiiDetectorId;
    readonly confidence: number;
    readonly metadata: Readonly<PiiSafeMetadata>;
}

export interface PiiClassificationResult {
    readonly spans: readonly ClassifiedPiiSpan[];
    readonly categories: readonly PiiCategory[];
}

export function classifyDetectedPii(
    detection: PiiDetectionResult,
): PiiClassificationResult {
    const spans = detection.spans.map(classifySpan);
    const categories = [...new Set(spans.map((span) => span.category))];

    return Object.freeze({
        spans: Object.freeze(spans),
        categories: Object.freeze(categories),
    });
}

function classifySpan(span: DetectedPiiSpan): ClassifiedPiiSpan {
    const category = CATEGORY_BY_DETECTOR[span.detector];

    if (!category) {
        throw new Error("Unsupported PII detector classification");
    }

    return Object.freeze({
        start: span.start,
        end: span.end,
        category,
        detector: span.detector,
        confidence: span.confidence,
        metadata: Object.freeze({ ...span.metadata }),
    });
}
