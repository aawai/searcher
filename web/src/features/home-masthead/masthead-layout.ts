import { BREAKPOINTS } from "../../design-system/breakpoints.ts";
import { formatCalmTime } from "../home-calm/calm-clock.ts";
import type { SafeRect } from "../home-layouts/home-viewport.ts";

export const MASTHEAD_MIN_WIDTH = 296;
export const MASTHEAD_MAX_WIDTH = 372;
export const MASTHEAD_VW_RATIO = 0.19;
export const MASTHEAD_SEARCH_GAP = 32;
/** Extra breathing room between the page margin and the column, taken only from spare width. */
export const MASTHEAD_EDGE_INSET_MAX = 48;
/** The veil reaches this far past the column's outer edge, so its fade
 *  (`--layout-masthead-veil-fade`, 640px) starts 40px inside the column. */
export const MASTHEAD_VEIL_TAIL = 600;
export const MASTHEAD_SWIPE_THRESHOLD = 48;

export type MastheadSide = "left" | "right";

/** Search box height before it has been measured. */
export const MASTHEAD_DEFAULT_SEARCH_HEIGHT = 56;
/** Space kept between the open narrow sheet and the search box docked below it. */
export const MASTHEAD_SHEET_SEARCH_GAP = 24;
/** Space kept between the collapsed narrow masthead's peek and the search box. */
export const MASTHEAD_PEEK_SEARCH_GAP = 8;
/** The collapsed top veil reaches this far below the peek, so its fade
 *  (`--layout-masthead-peek-fade`, 200px) starts 80px above the peek's bottom
 *  and dissolves behind the search box. */
export const MASTHEAD_PEEK_VEIL_TAIL = 120;

export type MastheadPlacement =
    | {
        mode: "side";
        side: MastheadSide;
        column: SafeRect;
        veilWidth: number;
    }
    | {
        mode: "narrow";
        /** Collapsed: the masthead's top shows from the free area's top down
         *  to just above the search box at its anchor, fading out at the bottom. */
        peek: SafeRect;
        /** The open sheet: from the free area's top to just above the docked search box. */
        sheet: SafeRect;
        /** Where the search box docks while the sheet is open. */
        searchDock: SafeRect;
    };

export interface MastheadPlacementInput {
    viewportWidth: number;
    availableRect: SafeRect;
    searchRect: SafeRect | null;
    focalX?: number;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;
const CHINESE_MONTHS = [
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月",
] as const;

export interface MastheadDateParts {
    day: string;
    weekday: string;
    month: string;
    time: string;
}

/** Clamp column width to `clamp(296px, 19vw, 372px)`. */
export function mastheadColumnWidth(viewportWidth: number): number {
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
        return MASTHEAD_MIN_WIDTH;
    }
    return Math.min(
        MASTHEAD_MAX_WIDTH,
        Math.max(MASTHEAD_MIN_WIDTH, viewportWidth * MASTHEAD_VW_RATIO),
    );
}

function defaultSearchRect(viewportWidth: number): SafeRect {
    const width = viewportWidth >= BREAKPOINTS.wide
        ? Math.min(880, Math.max(640, viewportWidth * 0.4))
        : Math.min(640, Math.max(0, viewportWidth - 32));
    return {
        x: (viewportWidth - width) / 2,
        y: 0,
        width,
        height: MASTHEAD_DEFAULT_SEARCH_HEIGHT,
    };
}

/**
 * Pure placement for the home masthead.
 * `availableRect` is already bounded by topbar, Dock and the 32px page margin.
 * The column sits on the `availableRect` edge of the chosen side and keeps at
 * least 32px from the search box outer edge.
 */
export function mastheadPlacement(
    input: MastheadPlacementInput,
): MastheadPlacement {
    const { viewportWidth, availableRect, searchRect, focalX } = input;
    const searchHeight = searchRect?.height ?? MASTHEAD_DEFAULT_SEARCH_HEIGHT;
    const narrow = (): MastheadPlacement => ({
        mode: "narrow",
        peek: {
            x: availableRect.x,
            y: availableRect.y,
            width: availableRect.width,
            height: searchRect
                ? Math.max(
                    0,
                    searchRect.y - MASTHEAD_PEEK_SEARCH_GAP - availableRect.y,
                )
                : 0,
        },
        sheet: {
            x: availableRect.x,
            y: availableRect.y,
            width: availableRect.width,
            height: Math.max(
                0,
                availableRect.height - searchHeight -
                    MASTHEAD_SHEET_SEARCH_GAP,
            ),
        },
        searchDock: {
            x: availableRect.x,
            y: availableRect.y + availableRect.height - searchHeight,
            width: availableRect.width,
            height: searchHeight,
        },
    });

    if (
        !Number.isFinite(viewportWidth) ||
        viewportWidth < BREAKPOINTS.medium ||
        availableRect.width <= 0 ||
        availableRect.height <= 0
    ) {
        return narrow();
    }

    const columnWidth = mastheadColumnWidth(viewportWidth);
    if (columnWidth > availableRect.width) {
        return narrow();
    }

    const search = searchRect ?? defaultSearchRect(viewportWidth);
    const leftX = availableRect.x;
    const rightX = availableRect.x + availableRect.width - columnWidth;

    const leftFits = leftX >= 0 &&
        leftX + columnWidth + MASTHEAD_SEARCH_GAP <= search.x;
    const rightFits = rightX >= availableRect.x &&
        rightX >= search.x + search.width + MASTHEAD_SEARCH_GAP;

    if (!leftFits && !rightFits) {
        return narrow();
    }

    const resolvedFocalX = typeof focalX === "number" && Number.isFinite(focalX)
        ? focalX
        : 0.5;
    const preferred: MastheadSide = resolvedFocalX < 0.5 ? "right" : "left";

    let side: MastheadSide;
    if (preferred === "left") {
        side = leftFits ? "left" : "right";
    } else {
        side = rightFits ? "right" : "left";
    }

    const slack = side === "left"
        ? search.x - MASTHEAD_SEARCH_GAP - (leftX + columnWidth)
        : rightX - (search.x + search.width + MASTHEAD_SEARCH_GAP);
    const inset = Math.min(MASTHEAD_EDGE_INSET_MAX, Math.max(0, slack));
    const x = side === "left" ? leftX + inset : rightX - inset;
    const column: SafeRect = {
        x,
        y: availableRect.y,
        width: columnWidth,
        height: availableRect.height,
    };
    const outerEdge = side === "left"
        ? column.x + column.width
        : Math.max(0, viewportWidth - column.x);
    const veilWidth = outerEdge + MASTHEAD_VEIL_TAIL;

    return {
        mode: "side",
        side,
        column,
        veilWidth,
    };
}

/** Splits a local `Date` into the typographic parts shown by the masthead. */
export function mastheadDateParts(date: Date): MastheadDateParts {
    return {
        day: String(date.getDate()),
        weekday: `星期${WEEKDAYS[date.getDay()]}`,
        month: CHINESE_MONTHS[date.getMonth()] ?? "一月",
        time: formatCalmTime(date),
    };
}

/** Formats a note's `updatedAt` timestamp relative to `now` for the meta line. */
export function formatRelativeNoteTime(
    updatedAt: number,
    now: Date | number = Date.now(),
): string {
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) return "";
    const nowMs = typeof now === "number" ? now : now.getTime();
    const diffMs = Math.max(0, nowMs - updatedAt);
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 1) return "刚刚";
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;

    const nowDate = typeof now === "number" ? new Date(now) : now;
    const targetDate = new Date(updatedAt);
    const todayStart = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        nowDate.getDate(),
    ).getTime();
    const yesterdayStart = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        nowDate.getDate() - 1,
    ).getTime();

    if (updatedAt >= todayStart) {
        const hours = Math.max(1, Math.floor(diffMs / 3_600_000));
        return `${hours} 小时前`;
    }
    if (updatedAt >= yesterdayStart) {
        return "昨天";
    }
    const month = targetDate.getMonth() + 1;
    const day = targetDate.getDate();
    if (targetDate.getFullYear() === nowDate.getFullYear()) {
        return `${month}月${day}日`;
    }
    return `${targetDate.getFullYear()}年${month}月${day}日`;
}

export interface MastheadSwipeInput {
    deltaX: number;
    deltaY: number;
    collapsed: boolean;
    panelScrollTop?: number;
}

/**
 * Decides whether a vertical touch gesture expands or collapses the narrow
 * masthead panel. Vertical movement must reach 48px and exceed horizontal drift.
 */
export function resolveMastheadSwipe(
    input: MastheadSwipeInput,
): "expand" | "collapse" | null {
    const { deltaX, deltaY, collapsed, panelScrollTop = 0 } = input;
    if (Math.abs(deltaY) < MASTHEAD_SWIPE_THRESHOLD) return null;
    if (Math.abs(deltaY) <= Math.abs(deltaX)) return null;
    if (collapsed && deltaY > 0) return "expand";
    if (!collapsed && deltaY < 0 && panelScrollTop <= 0) return "collapse";
    return null;
}
