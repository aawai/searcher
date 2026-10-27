/** A text fragment or element rectangle, relative to the preview content box. */
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
 * Range text rectangles can be inset from their line boxes by font-dependent
 * leading; restore half that leading at the bottom before clipping. Larger
 * element rectangles keep their measured bounds.
 * Whether anything is hidden is decided by the natural content height alone.
 */
export function clipPreviewHeight(
    lines: readonly PreviewLineRect[],
    limit: number,
    contentHeight: number,
    lineHeight: number,
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
    const visibleBottom = usable.reduce((bottom, line) => {
        const leading = Math.max(
            0,
            lineHeight - (line.bottom - line.top),
        ) / 2;
        const lineBottom = line.bottom + leading;
        return lineBottom <= max + EPSILON
            ? Math.max(bottom, lineBottom)
            : bottom;
    }, 0);
    return { height: Math.min(visibleBottom, max), hasMore: true };
}
