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
 * Whether anything is hidden is decided by the natural content height alone:
 * text fragments are glyph boxes inset inside their line boxes, so comparing
 * them with the content height would report overflow for content that fits.
 */
export function clipPreviewHeight(
    lines: readonly PreviewLineRect[],
    limit: number,
    contentHeight: number,
): PreviewClip {
    const max = Math.max(0, limit);
    const usable = lines.filter((line) =>
        Number.isFinite(line.top) && Number.isFinite(line.bottom) &&
        line.bottom > line.top + EPSILON && line.top >= -EPSILON
    );
    const content = usable.reduce(
        (bottom, line) => Math.max(bottom, line.bottom),
        Math.max(0, contentHeight),
    );
    if (content <= max + EPSILON) return { height: content, hasMore: false };
    if (usable.length === 0) return { height: max, hasMore: true };
    const visibleBottom = usable.reduce(
        (bottom, line) =>
            line.bottom <= max + EPSILON
                ? Math.max(bottom, line.bottom)
                : bottom,
        0,
    );
    return { height: Math.min(visibleBottom, max), hasMore: true };
}
