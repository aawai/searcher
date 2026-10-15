/**
 * Desktop geometry: every frame is viewport-global in CSS px.
 * Safe is only for OPEN/cascade; work is only for Snap; normal may extend behind Dock.
 */

import type { DesktopWindowState } from "./desktop-state.ts";

export interface Frame {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FrameBasis {
    width: number;
    height: number;
}

export interface SafeRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DesktopGeometry {
    viewportRect: SafeRect;
    workRect: SafeRect;
    safeRect: SafeRect;
    chromeBottom: number;
    dockTop: number;
    windowGap: number;
    chromeHeight: number;
    usable: boolean;
}

export function frameBasisForGeometry(
    geometry: DesktopGeometry,
): FrameBasis {
    const { width, height } = geometry.viewportRect;
    if (
        !Number.isFinite(width) || width <= 0 ||
        !Number.isFinite(height) || height <= 0
    ) {
        throw new RangeError(
            "Frame basis dimensions must be positive and finite",
        );
    }
    return { width, height };
}

function finite(value: number, fallback = 0): number {
    return Number.isFinite(value) ? value : fallback;
}

function bounded(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(Math.max(min, max), finite(value, min)));
}

export function desktopGeometry(
    width: number,
    height: number,
    chromeBottom = 0,
    dockTop = height,
    windowGap = 0,
    chromeHeight = 48,
    minContentHeight = 240,
): DesktopGeometry {
    width = Math.max(0, finite(width));
    height = Math.max(0, finite(height));
    chromeBottom = bounded(chromeBottom, 0, height);
    dockTop = bounded(dockTop, 0, height);
    windowGap = Math.max(0, finite(windowGap));
    chromeHeight = Math.max(0, finite(chromeHeight));
    const workHeight = Math.max(0, dockTop - chromeBottom);
    return {
        viewportRect: { x: 0, y: 0, width, height },
        workRect: { x: 0, y: chromeBottom, width, height: workHeight },
        safeRect: {
            x: windowGap,
            y: chromeBottom + windowGap,
            width: Math.max(0, width - 2 * windowGap),
            height: Math.max(0, workHeight - 2 * windowGap),
        },
        chromeBottom,
        dockTop,
        windowGap,
        chromeHeight,
        usable: width >= Math.max(160, chromeHeight * 4) &&
            workHeight >= chromeHeight + Math.max(0, finite(minContentHeight)),
    };
}

export type WindowKind = "apps" | "notes" | "note" | "documents" | "document";

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
 * When an available rect is supplied, min-size is bounded to its dimensions.
 */
export function minimumSize(kind: WindowKind, rect?: SafeRect): WindowSize {
    let baseW: number;
    let baseH: number;

    switch (kind) {
        case "apps":
        case "document":
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

/** Normal bounds deliberately permit the Dock to cover the bottom of the body. */
export function clampFrame(
    frame: Frame,
    geometry: DesktopGeometry,
    kind?: WindowKind,
    chromeHeight = geometry.chromeHeight,
): Frame {
    const { viewportRect: viewport, chromeBottom: top, dockTop } = geometry;
    const available = {
        x: 0,
        y: top,
        width: viewport.width,
        height: Math.max(0, viewport.height - top),
    };
    const min = kind ? minimumSize(kind, available) : { width: 0, height: 0 };
    const width = bounded(frame.width, min.width, available.width);
    const height = bounded(frame.height, min.height, available.height);
    return {
        x: bounded(frame.x, 0, viewport.width - width),
        y: bounded(
            frame.y,
            top,
            Math.min(viewport.height - height, dockTop - finite(chromeHeight)),
        ),
        width,
        height,
    };
}

/**
 * Resolves the current presentation for a semantic window without changing its
 * canonical frame or restore metadata.
 */
export function resolveWindowPresentationFrame(
    win: DesktopWindowState,
    geometry: DesktopGeometry,
): Frame {
    if (!geometry.usable) {
        return clampFrame(
            win.restoreFrame ?? win.frame,
            geometry,
            win.kind,
        );
    }

    if (win.mode === "maximized" || win.snap === "maximize") {
        return snapFrame("maximize", geometry.workRect);
    }
    if (win.snap) {
        return snapFrame(win.snap, geometry.workRect);
    }
    return clampFrame(win.frame, geometry, win.kind);
}

export function defaultFrame(
    kind: WindowKind,
    geometry: DesktopGeometry,
    cascadeIndex: number = 0,
): Frame {
    const rect = geometry.safeRect;
    const safeW = rect.width;
    const safeH = rect.height;

    // Default target proportions:
    // - apps: min(760, 72% width) x min(720, 78% height)
    // - notes: min(640, 62% width) x min(680, 74% height)
    // - note: min(560, 54% width) x min(600, 68% height)
    let targetW = 0;
    let targetH = 0;

    switch (kind) {
        case "document":
            targetW = Math.min(900, Math.round(safeW * 0.78));
            targetH = Math.min(820, Math.round(safeH * 0.84));
            break;
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

    return { x: rect.x + x, y: rect.y + y, width, height };
}

export function resizeFrame(
    frame: Frame,
    direction: ResizeDirection,
    dx: number,
    dy: number,
    geometry: DesktopGeometry,
    kind?: WindowKind,
    chromeHeight = geometry.chromeHeight,
): Frame {
    const base = clampFrame(frame, geometry, kind, chromeHeight);
    const { viewportRect: viewport, chromeBottom: topLimit, dockTop } =
        geometry;
    const min = minimumSize(kind ?? "note", {
        ...viewport,
        height: Math.max(0, viewport.height - topLimit),
    });
    let left = base.x;
    let right = base.x + base.width;
    let top = base.y;
    let bottom = base.y + base.height;

    if (direction.includes("e")) {
        right = bounded(right + dx, left + min.width, viewport.width);
    } else if (direction.includes("w")) {
        left = bounded(left + dx, 0, right - min.width);
    }
    if (direction.includes("s")) {
        bottom = bounded(bottom + dy, top + min.height, viewport.height);
    } else if (direction.includes("n")) {
        top = bounded(
            top + dy,
            topLimit,
            Math.min(bottom - min.height, dockTop - chromeHeight),
        );
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
}

export function snapFrame(mode: SnapMode, rect: SafeRect): Frame {
    const safeW = Math.max(0, rect.width);
    const safeH = Math.max(0, rect.height);
    const halfW = Math.floor(safeW / 2);
    const halfH = Math.floor(safeH / 2);

    switch (mode) {
        case "maximize":
            return { x: rect.x, y: rect.y, width: safeW, height: safeH };
        case "left":
            return { x: rect.x, y: rect.y, width: halfW, height: safeH };
        case "right":
            return {
                x: rect.x + halfW,
                y: rect.y,
                width: safeW - halfW,
                height: safeH,
            };
        case "top-left":
            return { x: rect.x, y: rect.y, width: halfW, height: halfH };
        case "top-right":
            return {
                x: rect.x + halfW,
                y: rect.y,
                width: safeW - halfW,
                height: halfH,
            };
        case "bottom-left":
            return {
                x: rect.x,
                y: rect.y + halfH,
                width: halfW,
                height: safeH - halfH,
            };
        case "bottom-right":
            return {
                x: rect.x + halfW,
                y: rect.y + halfH,
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
