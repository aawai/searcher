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
