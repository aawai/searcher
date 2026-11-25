import { BREAKPOINTS } from "../../design-system/breakpoints.ts";
import { formatCalmTime } from "../home-calm/calm-clock.ts";
import type { SafeRect } from "../home-layouts/home-viewport.ts";

export const MASTHEAD_MIN_WIDTH = 296;
export const MASTHEAD_MAX_WIDTH = 372;
export const MASTHEAD_VW_RATIO = 0.19;
export const MASTHEAD_SEARCH_GAP = 32;
/** Restrained frontispiece inset between the page margin and the expanded side column, taken only from spare width. */
export const MASTHEAD_EDGE_INSET_MAX = 36;
/** Minimum width for a date/time-only folio card (`--layout-masthead-compact-min`). */
export const MASTHEAD_COMPACT_MIN_WIDTH = 196;
/** Maximum width for the collapsed wide date stamp (`--layout-masthead-stamp-max`). */
export const MASTHEAD_STAMP_MAX_WIDTH = 280;
export const MASTHEAD_SWIPE_THRESHOLD = 48;

export type MastheadSide = "left" | "right";

/** Search box height before it has been measured. */
export const MASTHEAD_DEFAULT_SEARCH_HEIGHT = 52;
/** Space kept between the open narrow sheet and the search box docked below it. */
export const MASTHEAD_SHEET_SEARCH_GAP = 24;
/** Space kept between the collapsed narrow masthead's peek and the search box. */
export const MASTHEAD_PEEK_SEARCH_GAP = 8;
/** The collapsed narrow masthead shows only its first block (the date
 *  block, or the dek when the date and time are off); the peek reaches this
 *  far below it so the text halo is not clipped. */
export const MASTHEAD_PEEK_HALO_ROOM = 24;
/** Maximum bottom fade length on the collapsed narrow sheet (`--space-4`). */
export const MASTHEAD_PEEK_FADE_MAX = 16;
/** Slack kept solid below the collapsed first block before the mask fades. */
export const MASTHEAD_PEEK_FADE_BUFFER = 2;

export type MastheadPlacement =
    | {
        mode: "side";
        side: MastheadSide;
        column: SafeRect;
        /** Distance from the expanded column's outer edge to the viewport edge (`--masthead-edge-gap`). */
        edgeGap: number;
        /** Un-inset outer corner anchor flush with `availableRect` for the collapsed date stamp. */
        stampAnchor: MastheadSideAnchor;
    }
    | {
        mode: "narrow";
        /** Collapsed: the most room the peek may take, from the free area's
         *  top down to just above the search box at its anchor. */
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

export type MastheadSideAnchor =
    | { left: number; top: number }
    | { right: number; top: number };

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

export interface MastheadStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface MastheadStampInput {
    dateParts: MastheadDateParts;
    showDate: boolean;
    showTime: boolean;
    signedIn: boolean;
    openTaskCount: number;
    notesCount: number;
}

export interface MastheadStampModel {
    /** Primary emphasis text: day numeral, solo time, or "今日". */
    primary: string;
    primaryKind: "day" | "time" | "fallback";
    /** Secondary date metadata (e.g. "十一月 星期三") when showDate is on. */
    dateMeta: string | null;
    /** Tabular time shown alongside date when both showDate and showTime are on. */
    time: string | null;
    /** Accent badge text when signed in with open tasks (e.g. "2 待办"). */
    tasksLabel: string | null;
    /** Muted pinned notes count shown in fallback mode when date & time are both off. */
    notesLabel: string | null;
    /** Full accessible label for the collapsed date stamp button. */
    ariaLabel: string;
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
        ? Math.min(620, Math.max(580, viewportWidth * 0.32))
        : Math.min(580, Math.max(0, viewportWidth - 32));
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
 * The side column aligns flush with the chosen `availableRect` outer edge
 * (aligning with the top-left `s.` wordmark on the left, or the right margin /
 * Dock clearance on the right) and keeps at least 32px from the search box.
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
    const inset = slack > 0
        ? Math.min(MASTHEAD_EDGE_INSET_MAX, Math.round(slack * 0.4))
        : 0;
    const x = side === "left" ? leftX + inset : rightX - inset;
    const column: SafeRect = {
        x,
        y: availableRect.y,
        width: columnWidth,
        height: availableRect.height,
    };
    const edgeGap = side === "left"
        ? Math.max(0, column.x)
        : Math.max(0, viewportWidth - (column.x + column.width));
    const stampAnchor: MastheadSideAnchor = side === "left"
        ? { left: availableRect.x, top: availableRect.y }
        : {
            right: Math.max(
                0,
                viewportWidth - (availableRect.x + availableRect.width),
            ),
            top: availableRect.y,
        };

    return {
        mode: "side",
        side,
        column,
        edgeGap,
        stampAnchor,
    };
}

/**
 * Corner anchor shared by the expanded folio column, compact date-only card and
 * collapsed date stamp. Left mode pins to `column.x`; right mode pins to the
 * right inset so narrower cards and stamps keep their right edge aligned.
 */
export function mastheadSideAnchor(
    viewportWidth: number,
    column: SafeRect,
    side: MastheadSide,
): MastheadSideAnchor {
    if (side === "right") {
        return {
            right: Math.max(0, viewportWidth - (column.x + column.width)),
            top: column.y,
        };
    }
    return {
        left: column.x,
        top: column.y,
    };
}

/** Identity-scoped localStorage key for wide-mode masthead collapse state. */
export function mastheadSideCollapsedKey(
    userId: string | null | undefined,
): string {
    const identity = userId && userId.trim().length > 0 ? userId : "guest";
    return `home:masthead:sideCollapsed:${encodeURIComponent(identity)}`;
}

/** Reads per-identity wide-mode collapse state; defaults to false on missing/invalid/restricted storage. */
export function readMastheadSideCollapsed(
    storage: MastheadStorage | null | undefined,
    userId: string | null | undefined,
): boolean {
    try {
        return storage?.getItem(mastheadSideCollapsedKey(userId)) === "true";
    } catch {
        return false;
    }
}

/** Persists per-identity wide-mode collapse state; ignores storage exceptions quietly. */
export function writeMastheadSideCollapsed(
    storage: MastheadStorage | null | undefined,
    userId: string | null | undefined,
    collapsed: boolean,
): void {
    try {
        storage?.setItem(
            mastheadSideCollapsedKey(userId),
            collapsed ? "true" : "false",
        );
    } catch {
        // Keep in-memory toggle usable when storage is unavailable or restricted.
    }
}

/**
 * Builds structured display segments and accessible name for the collapsed wide
 * date stamp, guaranteeing a non-empty fallback when both date and time are off.
 */
export function buildMastheadStamp(
    input: MastheadStampInput,
): MastheadStampModel {
    const {
        dateParts,
        showDate,
        showTime,
        signedIn,
        openTaskCount,
        notesCount,
    } = input;
    const tasksLabel = signedIn && openTaskCount > 0
        ? `${openTaskCount} 待办`
        : null;

    if (showDate) {
        const dateMeta = `${dateParts.month} ${dateParts.weekday}`;
        const time = showTime ? dateParts.time : null;
        const spokenParts = [
            `${dateParts.day} ${dateMeta}`,
            time,
            tasksLabel,
        ].filter((part): part is string => Boolean(part));
        return {
            primary: dateParts.day,
            primaryKind: "day",
            dateMeta,
            time,
            tasksLabel,
            notesLabel: null,
            ariaLabel: `展开首页刊头，${spokenParts.join("，")}`,
        };
    }

    if (showTime) {
        const spokenParts = [dateParts.time, tasksLabel].filter(
            (part): part is string => Boolean(part),
        );
        return {
            primary: dateParts.time,
            primaryKind: "time",
            dateMeta: null,
            time: null,
            tasksLabel,
            notesLabel: null,
            ariaLabel: `展开首页刊头，${spokenParts.join("，")}`,
        };
    }

    const notesLabel = signedIn && notesCount > 0
        ? `${notesCount} 篇笔记`
        : null;
    const spokenParts = ["今日", tasksLabel, notesLabel].filter(
        (part): part is string => Boolean(part),
    );
    return {
        primary: "今日",
        primaryKind: "fallback",
        dateMeta: null,
        time: null,
        tasksLabel,
        notesLabel,
        ariaLabel: `展开首页刊头，${spokenParts.join("，")}`,
    };
}

export interface MastheadPeekMetrics {
    height: number;
    fadeTail: number;
    hidden: boolean;
}

/**
 * Computes the collapsed narrow peek height, bottom fade tail and whether the
 * peek must hide because even the first block cannot fit above the search box.
 */
export function mastheadPeekMetrics(
    availablePeekHeight: number,
    blockHeight: number | null,
): MastheadPeekMetrics {
    const boundedAvailable = Math.max(
        0,
        Number.isFinite(availablePeekHeight) ? availablePeekHeight : 0,
    );
    if (blockHeight === null || !Number.isFinite(blockHeight)) {
        return {
            height: boundedAvailable,
            fadeTail: MASTHEAD_PEEK_FADE_MAX,
            hidden: false,
        };
    }
    const measuredBlock = Math.max(0, blockHeight);
    const height = Math.min(
        boundedAvailable,
        measuredBlock + MASTHEAD_PEEK_HALO_ROOM,
    );
    const fadeTail = Math.min(
        MASTHEAD_PEEK_FADE_MAX,
        Math.max(0, height - measuredBlock - MASTHEAD_PEEK_FADE_BUFFER),
    );
    return {
        height,
        fadeTail,
        hidden: boundedAvailable < measuredBlock,
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
