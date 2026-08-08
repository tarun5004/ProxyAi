export const PII_CATEGORIES = [
    "CONTACT_INFO",
    "FINANCIAL",
    "GOVERNMENT_ID",
    "CREDENTIAL",
    "INTERNAL_SECRET",
    "BUSINESS_CONFIDENTIAL",
] as const;

export const PII_DETECTOR_IDS = [
    "email",
    "phone",
    "payment_card_luhn",
    "government_id",
    "api_key",
    "connection_string",
] as const;

export type PiiCategory = (typeof PII_CATEGORIES)[number];
export type PiiDetectorId = (typeof PII_DETECTOR_IDS)[number];

export interface DetectedPiiSpan {
    start: number;
    end: number;
    category: PiiCategory;
    detector: PiiDetectorId;
    confidence: number;
    metadata: PiiSafeMetadata;
}

export interface PiiSafeMetadata {
    kind: PiiDetectorId;
    length: number;
    normalizedLength?: number;
}

export interface PiiDetectionResult {
    spans: readonly DetectedPiiSpan[];
    categories: readonly PiiCategory[];
}

interface CandidateSpan extends DetectedPiiSpan {
    priority: number;
}

interface DetectorRule {
    detector: PiiDetectorId;
    category: PiiCategory;
    confidence: number;
    priority: number;
    pattern: RegExp;
    validate?: (value: string) => boolean;
    normalizeLength?: (value: string) => number;
}

const DETECTOR_RULES: readonly DetectorRule[] = Object.freeze([
    {
        detector: "connection_string",
        category: "INTERNAL_SECRET",
        confidence: 0.95,
        priority: 100,
        pattern:
            /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s"'<>]+/giu,
    },
    {
        detector: "api_key",
        category: "CREDENTIAL",
        confidence: 0.9,
        priority: 90,
        pattern:
            /\b(?:sk-[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AIza[0-9A-Za-z_-]{20,}|(?:api[_-]?key|access[_-]?token|bearer)\s*[:=]\s*[A-Za-z0-9._~-]{16,})\b/giu,
    },
    {
        detector: "payment_card_luhn",
        category: "FINANCIAL",
        confidence: 0.85,
        priority: 80,
        pattern: /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/gu,
        validate: isValidPaymentCardCandidate,
        normalizeLength: (value) => digitsOnly(value).length,
    },
    {
        detector: "government_id",
        category: "GOVERNMENT_ID",
        confidence: 0.8,
        priority: 70,
        pattern:
            /\b(?:[A-Z]{5}[0-9]{4}[A-Z]|[A-Z]{2}[0-9]{2}[ -]?[0-9]{11}|[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{4})\b/gu,
    },
    {
        detector: "email",
        category: "CONTACT_INFO",
        confidence: 0.85,
        priority: 60,
        pattern:
            /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/giu,
    },
    {
        detector: "phone",
        category: "CONTACT_INFO",
        confidence: 0.65,
        priority: 50,
        pattern:
            /(?<![\w@])(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{3,4}(?![\w@])/gu,
        validate: isValidPhoneCandidate,
        normalizeLength: (value) => digitsOnly(value).length,
    },
]);

export function detectPii(text: string): PiiDetectionResult {
    const candidates = collectCandidates(text);
    const spans = removeOverlaps(candidates)
        .map(removePriority)
        .sort(compareByPosition);

    return {
        spans: Object.freeze(spans),
        categories: Object.freeze(
            [...new Set(spans.map((span) => span.category))],
        ),
    };
}

function collectCandidates(text: string): CandidateSpan[] {
    const candidates: CandidateSpan[] = [];

    for (const rule of DETECTOR_RULES) {
        rule.pattern.lastIndex = 0;

        for (const match of text.matchAll(rule.pattern)) {
            const matchedValue = match[0];
            const start = match.index;

            if (start === undefined || matchedValue.length === 0) {
                continue;
            }

            if (rule.validate && !rule.validate(matchedValue)) {
                continue;
            }

            const end = start + matchedValue.length;
            const metadata: PiiSafeMetadata = {
                kind: rule.detector,
                length: end - start,
            };
            const normalizedLength =
                rule.normalizeLength?.(matchedValue);

            if (normalizedLength !== undefined) {
                metadata.normalizedLength = normalizedLength;
            }

            candidates.push({
                start,
                end,
                category: rule.category,
                detector: rule.detector,
                confidence: rule.confidence,
                metadata,
                priority: rule.priority,
            });
        }
    }

    return candidates;
}

function removeOverlaps(
    candidates: readonly CandidateSpan[],
): CandidateSpan[] {
    const selected: CandidateSpan[] = [];
    const sortedCandidates = [...candidates].sort(compareByPrecedence);

    for (const candidate of sortedCandidates) {
        if (
            selected.some((span) =>
                spansOverlap(candidate, span),
            )
        ) {
            continue;
        }

        selected.push(candidate);
    }

    return selected;
}

function compareByPrecedence(
    left: CandidateSpan,
    right: CandidateSpan,
): number {
    return right.priority - left.priority
        || left.start - right.start
        || (right.end - right.start) - (left.end - left.start);
}

function compareByPosition(
    left: DetectedPiiSpan,
    right: DetectedPiiSpan,
): number {
    return left.start - right.start
        || left.end - right.end
        || left.detector.localeCompare(right.detector);
}

function spansOverlap(
    left: Pick<DetectedPiiSpan, "start" | "end">,
    right: Pick<DetectedPiiSpan, "start" | "end">,
): boolean {
    return left.start < right.end && right.start < left.end;
}

function removePriority(candidate: CandidateSpan): DetectedPiiSpan {
    return {
        start: candidate.start,
        end: candidate.end,
        category: candidate.category,
        detector: candidate.detector,
        confidence: candidate.confidence,
        metadata: Object.freeze({ ...candidate.metadata }),
    };
}

function isValidPaymentCardCandidate(value: string): boolean {
    const digits = digitsOnly(value);

    return digits.length >= 13
        && digits.length <= 19
        && luhnCheck(digits);
}

function isValidPhoneCandidate(value: string): boolean {
    const digits = digitsOnly(value);

    return digits.length >= 10 && digits.length <= 15;
}

function luhnCheck(digits: string): boolean {
    let sum = 0;
    let shouldDouble = false;

    for (let index = digits.length - 1; index >= 0; index -= 1) {
        let digit = Number(digits[index]);

        if (shouldDouble) {
            digit *= 2;

            if (digit > 9) {
                digit -= 9;
            }
        }

        sum += digit;
        shouldDouble = !shouldDouble;
    }

    return sum > 0 && sum % 10 === 0;
}

function digitsOnly(value: string): string {
    return value.replace(/\D/gu, "");
}
