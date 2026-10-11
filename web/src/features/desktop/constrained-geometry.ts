/**
 * Desktop Window Constrained Geometry Engine
 * Issue #89: 768-1023 constrained single-surface window geometry and canonical presets.
 */

import type { Frame, SafeRect } from "./desktop-geometry.ts";

export type ConstrainedPreset = "medium" | "large" | "fullscreen";

export const CONSTRAINED_PRESETS: readonly ConstrainedPreset[] = [
    "medium",
    "large",
    "fullscreen",
] as const;

export const CONSTRAINED_PRESET_LABELS: Record<ConstrainedPreset, string> = {
    medium: "中等尺寸",
    large: "大尺寸",
    fullscreen: "全屏",
};

export interface ConstrainedFrameOptions {
    preset: ConstrainedPreset;
    rect: SafeRect;
    gap?: number;
}

/**
 * Checks if the given viewport width is within the constrained tablet range (768..1023).
 */
export function isConstrainedViewport(width: number): boolean {
    return width >= 768 && width < 1024;
}

/**
 * Checks if the given viewport width is full desktop (>= 1024).
 */
export function isDesktopViewport(width: number): boolean {
    return width >= 1024;
}

/**
 * Computes the constrained window frame for a given preset inside the supplied rect:
 * - medium: min 680 / 78%w x min 720 / 72%h, centered in the rect
 * - large: min 880 / (rectW - 2*gap) x min 820 / 88%h, centered in the rect
 * - fullscreen: fills the rect
 *
 * Returned coordinates are viewport-global, including the rect origin.
 */
export function computeConstrainedFrame(
    options: ConstrainedFrameOptions,
): Frame {
    const { preset, rect, gap = 16 } = options;
    const safeW = Math.max(0, rect.width);
    const safeH = Math.max(0, rect.height);

    if (preset === "fullscreen") {
        return {
            x: rect.x,
            y: rect.y,
            width: safeW,
            height: safeH,
        };
    }

    let width = 0;
    let height = 0;

    if (preset === "medium") {
        width = Math.min(680, safeW * 0.78);
        height = Math.min(720, safeH * 0.72);
    } else if (preset === "large") {
        width = Math.min(880, Math.max(0, safeW - 2 * gap));
        height = Math.min(820, safeH * 0.88);
    }

    const x = rect.x + (safeW - width) / 2;
    const y = rect.y + (safeH - height) / 2;

    return { x, y, width, height };
}
