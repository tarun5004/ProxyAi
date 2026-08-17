import {
    classifyDetectedPii,
    type PiiClassificationResult,
} from "./pii-classifier.js";
import {
    detectPii,
    type PiiDetectionResult,
} from "./pii-detector.js";
import {
    maskClassifiedPii,
    type PiiMaskResult,
} from "./pii-masker.js";

export interface PiiPromptRequest {
    readonly prompt: string;
}

export interface SanitizedPiiPromptRequest {
    readonly prompt: string;
}

export interface PiiPromptProcessingResult {
    readonly sanitizedRequest: SanitizedPiiPromptRequest;
    readonly detection: PiiDetectionResult;
    readonly classification: PiiClassificationResult;
    readonly masking: PiiMaskResult;
}

export function processPiiPromptImmutably<
    TRequest extends PiiPromptRequest,
>(request: TRequest): PiiPromptProcessingResult {
    const sourcePrompt = request.prompt;
    const detected = detectPii(sourcePrompt);
    const detection = Object.freeze({
        spans: detected.spans,
        categories: detected.categories,
    });
    const classification = classifyDetectedPii(detection);
    const masking = maskClassifiedPii(sourcePrompt, classification);

    return Object.freeze({
        sanitizedRequest: Object.freeze({
            prompt: masking.maskedText,
        }),
        detection,
        classification,
        masking,
    });
}
