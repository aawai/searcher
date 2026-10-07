/**
 * Desktop Window Geometry Engine
 * Issue #88: Window Manager geometry, safe rect bounding, cascade, and 8-way resize.
 */

export interface Frame {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SafeRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type WindowKind = "apps" | "notes" | "note" | "documents";

export type SnapMode =
    | "left"
    | "right"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "maximize";

export const SNAP_EDGE_THRESHOLD = 32;
export const SNAP_CORNER_THRESHOLD = 80;
export const SNAP_MAX_OUTER_MARGIN = 80;

export type ResizeDirection =
    | "n"
    | "ne"
    | "e"
    | "se"
    | "s"
    | "sw"
    | "w"
    | "nw";

export interface WindowSize {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
}

/**
 * Documented sensible minimum sizes per window kind:
 * - apps: 480x360 (full application launcher/creator needs minimum width for multi-column grid)
 * - notes: 400x320 (workspace notes list + reading panel)
 * - note: 320x240 (individual card/editor titlebar + controls)
 * When safe rect is provided, min-size is bounded by available safe size.
 */
export function minimumSize(kind: WindowKind, rect?: SafeRect): WindowSize {
    let baseW: number;
    let baseH: number;

    switch (kind) {
        case "apps":
        case "documents":
            baseW = 480;
            baseH = 360;
            break;
        case "notes":
            baseW = 400;
            baseH = 320;
            break;
        case "note":
            baseW = 320;
            baseH = 240;
            break;
    }

    if (rect) {
        const safeW = Math.max(0, rect.width);
        const safeH = Math.max(0, rect.height);
        baseW = Math.min(baseW, safeW);
        baseH = Math.min(baseH, safeH);
    }

    return {
        width: baseW,
        height: baseH,
        minWidth: baseW,
        minHeight: baseH,
    };
}

/**
 * Clamps a frame fully inside the safe rect:
 * - Coordinates x, y are always safe-relative (0, 0 is safe-rect top-left).
 * - Enforces minimum size (bounded by available safe size).
 * - Clamps width/height to safe rect width/height.
 * - Ensures titlebar is fully visible inside safe rect (>= 80px).
 */
export function clampFrame(
    frame: Frame,
    rect: SafeRect,
    kind?: WindowKind,
): Frame {
    const safeW = Math.max(0, rect.width);
    const safeH = Math.max(0, rect.height);

    // Minimum size enforcement
    let minW = 0;
    let minH = 0;
    if (kind) {
        const min = minimumSize(kind, rect);
        minW = min.width;
        minH = min.height;
    }

    // Size clamping: at least min size, at most safe rect dimensions
    let width = Math.max(minW, frame.width);
    let height = Math.max(minH, frame.height);
    width = Math.min(safeW, width);
    height = Math.min(safeH, height);

    // Position clamping: fully inside [0..safeW - width, 0..safeH - height]
    const maxX = Math.max(0, safeW - width);
    const maxY = Math.max(0, safeH - height);
    const x = Math.max(0, Math.min(maxX, frame.x));
    const y = Math.max(0, Math.min(maxY, frame.y));

    return { x, y, width, height };
}

export function defaultFrame(
    kind: WindowKind,
    rect: SafeRect,
    cascadeIndex: number = 0,
): Frame {
    const safeW = Math.max(0, rect.width);
    const safeH = Math.max(0, rect.height);

    // Default target proportions:
    // - apps: min(760, 72% width) x min(720, 78% height)
    // - notes: min(640, 62% width) x min(680, 74% height)
    // - note: min(560, 54% width) x min(600, 68% height)
    let targetW = 0;
    let targetH = 0;

    switch (kind) {
        case "apps":
        case "documents":
            targetW = Math.min(760, Math.round(safeW * 0.72));
            targetH = Math.min(720, Math.round(safeH * 0.78));
            break;
        case "notes":
            targetW = Math.min(640, Math.round(safeW * 0.62));
            targetH = Math.min(680, Math.round(safeH * 0.74));
            break;
        case "note":
            targetW = Math.min(560, Math.round(safeW * 0.54));
            targetH = Math.min(600, Math.round(safeH * 0.68));
            break;
    }

    // Min-size bounded by available safe size
    const min = minimumSize(kind, rect);
    let width = Math.max(min.width, targetW);
    let height = Math.max(min.height, targetH);
    width = Math.min(safeW, width);
    height = Math.min(safeH, height);

    // Centered base origin
    const startX = Math.max(0, Math.round((safeW - width) / 2));
    const startY = Math.max(0, Math.round((safeH - height) / 2));

    // Deterministic 24px cascade, resetting back to safe origin at edges
    const CASCADE_STEP = 24;
    const availX = Math.max(0, safeW - width - startX);
    const availY = Math.max(0, safeH - height - startY);
    const maxSteps = Math.max(
        0,
        Math.floor(Math.min(availX, availY) / CASCADE_STEP),
    );

    const effectiveStep = maxSteps > 0
        ? Math.max(0, cascadeIndex) % (maxSteps + 1)
        : 0;

    const x = startX + effectiveStep * CASCADE_STEP;
    const y = startY + effectiveStep * CASCADE_STEP;

    return clampFrame({ x, y, width, height }, rect, kind);
}

export function resizeFrame(
    frame: Frame,
    direction: ResizeDirection,
    dx: number,
    dy: number,
    rect: SafeRect,
    kind?: WindowKind,
): Frame {
    const safeW = Math.max(0, rect.width);
    const safeH = Math.max(0, rect.height);

    const min = kind
        ? minimumSize(kind, rect)
        : { width: 320, height: 240, minWidth: 320, minHeight: 240 };

    const minW = Math.min(min.width, safeW);
    const minH = Math.min(min.height, safeH);

    let left = frame.x;
    let right = frame.x + frame.width;
    let top = frame.y;
    let bottom = frame.y + frame.height;

    // Horizontal resizing
    if (direction.includes("e")) {
        right = Math.min(safeW, Math.max(left + minW, right + dx));
    } else if (direction.includes("w")) {
        left = Math.max(0, Math.min(right - minW, left + dx));
    }

    // Vertical resizing
    if (direction.includes("s")) {
        bottom = Math.min(safeH, Math.max(top + minH, bottom + dy));
    } else if (direction.includes("n")) {
        top = Math.max(0, Math.min(bottom - minH, top + dy));
    }

    const width = Math.max(minW, right - left);
    const height = Math.max(minH, bottom - top);

    return clampFrame({ x: left, y: top, width, height }, rect, kind);
}

export function snapFrame(mode: SnapMode, rect: SafeRect): Frame {
    const safeW = Math.max(0, rect.width);
    const safeH = Math.max(0, rect.height);
    const halfW = Math.floor(safeW / 2);
    const halfH = Math.floor(safeH / 2);

    switch (mode) {
        case "maximize":
            return { x: 0, y: 0, width: safeW, height: safeH };
        case "left":
            return { x: 0, y: 0, width: halfW, height: safeH };
        case "right":
            return { x: halfW, y: 0, width: safeW - halfW, height: safeH };
        case "top-left":
            return { x: 0, y: 0, width: halfW, height: halfH };
        case "top-right":
            return { x: halfW, y: 0, width: safeW - halfW, height: halfH };
        case "bottom-left":
            return { x: 0, y: halfH, width: halfW, height: safeH - halfH };
        case "bottom-right":
            return {
                x: halfW,
                y: halfH,
                width: safeW - halfW,
                height: safeH - halfH,
            };
    }
}

export function snapTarget(
    clientX: number,
    clientY: number,
    rect: SafeRect,
): SnapMode | null {
    if (rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    const relX = clientX - rect.x;
    const relY = clientY - rect.y;

    if (
        relX < -SNAP_MAX_OUTER_MARGIN ||
        relX > rect.width + SNAP_MAX_OUTER_MARGIN ||
        relY < -SNAP_MAX_OUTER_MARGIN ||
        relY > rect.height + SNAP_MAX_OUTER_MARGIN
    ) {
        return null;
    }

    const edgeThreshold = SNAP_EDGE_THRESHOLD;
    const cornerThreshold = Math.min(
        SNAP_CORNER_THRESHOLD,
        rect.width / 3,
        rect.height / 3,
    );

    const isNearTop = relY <= edgeThreshold;
    const isNearBottom = relY >= rect.height - edgeThreshold;
    const isNearLeft = relX <= edgeThreshold;
    const isNearRight = relX >= rect.width - edgeThreshold;

    const isCornerLeft = relX <= cornerThreshold;
    const isCornerRight = relX >= rect.width - cornerThreshold;
    const isCornerTop = relY <= cornerThreshold;
    const isCornerBottom = relY >= rect.height - cornerThreshold;

    if ((isNearTop && isCornerLeft) || (isNearLeft && isCornerTop)) {
        return "top-left";
    }
    if ((isNearTop && isCornerRight) || (isNearRight && isCornerTop)) {
        return "top-right";
    }
    if ((isNearBottom && isCornerLeft) || (isNearLeft && isCornerBottom)) {
        return "bottom-left";
    }
    if ((isNearBottom && isCornerRight) || (isNearRight && isCornerBottom)) {
        return "bottom-right";
    }
    if (isNearTop) {
        return "maximize";
    }
    if (isNearLeft) {
        return "left";
    }
    if (isNearRight) {
        return "right";
    }

    return null;
}
