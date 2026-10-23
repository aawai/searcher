export interface ViewportSize {
    width: number;
    height: number;
}

/**
 * Whether a window resize changes the layout viewport the library plans for.
 * Some mobile browsers shrink the layout viewport while the soft keyboard is up
 * (width unchanged, an editable field focused); that must not re-plan the grid.
 */
export function shouldRelayout(
    previous: ViewportSize,
    next: ViewportSize,
    editableFocused: boolean,
): boolean {
    if (previous.width !== next.width) return true;
    if (previous.height === next.height) return false;
    return !editableFocused;
}

/** Pixel length from a computed CSS value such as `84px`; NaN when absent. */
export function pixels(value: string): number {
    return Number.parseFloat(value);
}

export interface GridMetrics {
    /** Grid top in layout (document) coordinates, excluding any arranging bar. */
    gridTop: number;
    /** Cell height plus row gap. */
    rowPitch: number;
}
