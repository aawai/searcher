/** Free-window geometry: every placement is computed inside one work area. */

export type Rect = { x: number; y: number; width: number; height: number };
export type Geometry = {
    /** Viewport minus safe areas, `--window-margin`, Dock, ball and banner. */
    area: Rect;
    wide: boolean;
    /** `--window-margin`: also the gap between side-by-side halves. */
    margin: number;
    step: number;
    fine: number;
    minWidth: number;
    minHeight: number;
    defaultWidth: number;
    defaultHeight: number;
    /** The Dock icon an anchored window opens beside, when it is visible. */
    anchor: { rect: Rect; edge: string } | null;
};
export type Direction = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
/** Single-pointer alternatives to dragging the title bar or edges (2.5.7). */
export type WindowPreset = "center" | "left" | "right" | "default";

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, Math.max(min, max)));

/** Fits `rect` into `area`, shrinking it first when it is larger. */
export function project(rect: Rect, area: Rect): Rect {
    const width = Math.min(rect.width, area.width);
    const height = Math.min(rect.height, area.height);
    return {
        width,
        height,
        x: clamp(rect.x, area.x, area.x + area.width - width),
        y: clamp(rect.y, area.y, area.y + area.height - height),
    };
}

export function resize(
    rect: Rect,
    direction: Direction,
    dx: number,
    dy: number,
    g: Geometry,
): Rect {
    const a = g.area;
    const minW = Math.min(g.minWidth, a.width),
        minH = Math.min(g.minHeight, a.height);
    let left = rect.x,
        right = rect.x + rect.width,
        top = rect.y,
        bottom = rect.y + rect.height;
    if (direction.includes("w")) left = clamp(left + dx, a.x, right - minW);
    if (direction.includes("e")) {
        right = clamp(right + dx, left + minW, a.x + a.width);
    }
    if (direction.includes("n")) top = clamp(top + dy, a.y, bottom - minH);
    if (direction.includes("s")) {
        bottom = clamp(bottom + dy, top + minH, a.y + a.height);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
}

function centered(width: number, height: number, area: Rect): Rect {
    return {
        x: area.x + (area.width - width) / 2,
        y: area.y + (area.height - height) / 2,
        width,
        height,
    };
}

/** Centered, or beside the anchoring Dock icon on the side it faces. */
export function initialRect(geometry: Geometry, area: Rect): Rect {
    const width = geometry.defaultWidth, height = geometry.defaultHeight;
    const center = centered(width, height, area);
    const anchor = geometry.anchor;
    if (!anchor) return center;
    const { rect, edge } = anchor;
    const gap = geometry.step;
    const alongX = rect.x + (rect.width - width) / 2;
    // Along a side Dock the window stays centered in the work area: aligning
    // it with the icon would pin it to the top of the screen.
    if (edge === "top") {
        return { ...center, x: alongX, y: rect.y + rect.height + gap };
    }
    if (edge === "left") return { ...center, x: rect.x + rect.width + gap };
    if (edge === "right") return { ...center, x: rect.x - gap - width };
    return { ...center, x: alongX, y: rect.y - gap - height };
}

/**
 * The rectangle a preset places the window at, given its normal (unmaximized)
 * rectangle. Halves fill the work area's height and leave `margin` between
 * them, but never go below the minimum window width; "default" restores the
 * default size around the current center.
 */
export function presetRect(
    preset: WindowPreset,
    current: Rect,
    g: Geometry,
): Rect {
    const a = g.area;
    if (preset === "left" || preset === "right") {
        const width = Math.max(
            Math.min(g.minWidth, a.width),
            Math.floor((a.width - g.margin) / 2),
        );
        return {
            x: preset === "left" ? a.x : a.x + a.width - width,
            y: a.y,
            width,
            height: a.height,
        };
    }
    const fitted = project(current, a);
    if (preset === "center") {
        return centered(fitted.width, fitted.height, a);
    }
    const width = Math.min(g.defaultWidth, a.width),
        height = Math.min(g.defaultHeight, a.height);
    return project({
        x: fitted.x + (fitted.width - width) / 2,
        y: fitted.y + (fitted.height - height) / 2,
        width,
        height,
    }, a);
}
