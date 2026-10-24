/** A line box measured inside the note preview, relative to its content box. */
export interface PreviewLineRect {
    top: number;
    bottom: number;
}

export interface PreviewClip {
    /** Visible body height, ending at the bottom of a whole line box. */
    height: number;
    /** More content starts below the visible height. */
    hasMore: boolean;
}

const EPSILON = 0.5;

/**
 * Clips a Markdown preview to the bottom of its last fully visible line box.
 * Line boxes rather than a fixed multiple of the line height are authoritative:
 * task rows, list items and paragraphs can round differently in the browser.
 */
export function clipPreviewHeight(
    lines: readonly PreviewLineRect[],
    limit: number,
    contentHeight: number,
): PreviewClip {
    const usable = lines.filter((line) =>
        Number.isFinite(line.top) && Number.isFinite(line.bottom) &&
        line.bottom > line.top + EPSILON && line.top >= -EPSILON
    );
    if (usable.length === 0) {
        const height = Math.min(Math.max(0, limit), Math.max(0, contentHeight));
        return {
            height,
            hasMore: contentHeight > height + EPSILON,
        };
    }
    const seen = new Set<string>();
    let visibleBottom = 0;
    let contentBottom = 0;
    for (const line of usable) {
        const key = `${Math.round(line.top)}:${Math.round(line.bottom)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        contentBottom = Math.max(contentBottom, line.bottom);
        if (line.bottom <= limit + EPSILON) {
            visibleBottom = Math.max(visibleBottom, line.bottom);
        }
    }
    const fullHeight = Math.max(contentHeight, contentBottom);
    const hasMore = fullHeight > visibleBottom + EPSILON;
    return {
        height: hasMore
            ? Math.max(0, Math.min(visibleBottom, limit))
            : Math.max(0, Math.min(fullHeight, limit)),
        hasMore,
    };
}
