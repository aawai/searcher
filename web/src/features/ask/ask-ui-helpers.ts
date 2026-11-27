import type { GenerationConfig } from "./types.ts";

/**
 * Returns true only when the user has overridden generation parameters
 * relative to the model's resolved baseline configuration.
 */
export function hasCustomGenerationOverrides(
    current: GenerationConfig,
    baseline: GenerationConfig,
    isReasoningStrict?: boolean,
): boolean {
    if (!isReasoningStrict) {
        if (current.temperature !== baseline.temperature) return true;
        if (current.topP !== baseline.topP) return true;
    }
    if (current.maxTokens !== baseline.maxTokens) return true;
    if (current.reasoningEffort !== baseline.reasoningEffort) return true;
    return false;
}

export interface HighlightSegment {
    text: string;
    match: boolean;
}

/**
 * Splits `text` into matched and unmatched segments for case-insensitive
 * search highlighting while preserving original casing.
 */
export function splitHighlightSegments(
    text: string,
    query: string,
): HighlightSegment[] {
    const trimmed = query.trim();
    if (!trimmed) return [{ text, match: false }];

    const lowerText = text.toLowerCase();
    const lowerQuery = trimmed.toLowerCase();
    const segments: HighlightSegment[] = [];
    let cursor = 0;

    while (cursor < text.length) {
        const index = lowerText.indexOf(lowerQuery, cursor);
        if (index === -1) {
            segments.push({ text: text.slice(cursor), match: false });
            break;
        }
        if (index > cursor) {
            segments.push({ text: text.slice(cursor, index), match: false });
        }
        segments.push({
            text: text.slice(index, index + trimmed.length),
            match: true,
        });
        cursor = index + trimmed.length;
    }

    return segments.length > 0 ? segments : [{ text, match: false }];
}

/**
 * Limits visualViewport max-height clamping to standalone pages or when an
 * on-screen keyboard shrinks the visual viewport below `innerHeight`.
 */
export function shouldUseVisualViewportHeight(params: {
    inWindow?: boolean;
    viewportHeight: number;
    innerHeight: number;
}): boolean {
    if (!params.inWindow) return true;
    return params.viewportHeight < params.innerHeight - 1;
}
