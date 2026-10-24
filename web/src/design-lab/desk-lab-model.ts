import {
    calculateDesktopLayout,
    type DesktopPlacement,
} from "../components/searcher/desktopLayout.ts";

/** 静 (calm) / 用 (input) / 览 (overview): three distances to one desk. */
export type DeskStage = "calm" | "input" | "overview";
export type ZoomIntent = "out" | "in";

export type DeskObjectKind =
    | "notes"
    | "conversations"
    | "folder"
    | "apps"
    | "paper";

export type DeskObject = {
    id: string;
    kind: DeskObjectKind;
    title: string;
    detail: string;
    /** Folder or apps cluster: shown as a 2×2 large folder. */
    large?: boolean;
    color?: "paper" | "amber" | "rose" | "sage" | "sky";
    /** Leading items the tile previews: recent titles or app names. */
    preview?: readonly string[];
};

export const DESK_KIND_LABEL: Record<DeskObjectKind, string> = {
    notes: "笔记",
    conversations: "AI 对话",
    folder: "文件夹",
    apps: "应用",
    paper: "首页纸张",
};

/** Section order of the list fallback; mirrors the canonical object order. */
export const DESK_KIND_ORDER: readonly DeskObjectKind[] = [
    "notes",
    "conversations",
    "apps",
    "folder",
    "paper",
];

const PAPER_COLORS = ["paper", "amber", "rose", "sage", "sky"] as const;

/**
 * Mock desk with `count` objects in canonical order: the notes stack and the
 * conversation stack first, then app clusters in library order, then home
 * papers in home order. No private data: the lab is a public bundle.
 */
export function mockDeskObjects(count: number): DeskObject[] {
    const base: DeskObject[] = [
        {
            id: "notes",
            kind: "notes",
            title: "笔记",
            detail: "128 篇 · 最近：读书笔记",
            preview: ["读书笔记", "周会记录", "旅行清单", "灵感"],
        },
        {
            id: "conversations",
            kind: "conversations",
            title: "AI 对话",
            detail: "12 个 · 最近：旅行计划",
            preview: ["旅行计划", "代码评审"],
        },
        {
            id: "apps",
            kind: "apps",
            title: "应用",
            detail: "8 个应用",
            preview: ["GitHub", "邮箱", "日历", "MDN", "Figma", "豆瓣"],
        },
        {
            id: "folder-work",
            kind: "folder",
            title: "工作",
            detail: "6 个应用",
            large: true,
            preview: ["Linear", "Slack", "Notion", "Jira"],
        },
        {
            id: "folder-read",
            kind: "folder",
            title: "阅读",
            detail: "4 个应用",
        },
        {
            id: "paper-ideas",
            kind: "paper",
            title: "灵感",
            detail: "今天的灵感来源是散步",
            color: "amber",
        },
        {
            id: "paper-todo",
            kind: "paper",
            title: "本周待办",
            detail: "2 项待办",
            color: "sage",
        },
    ];
    const objects = base.slice(0, Math.max(0, count));
    for (let index = objects.length; index < count; index++) {
        const folder = index % 4 === 0;
        objects.push(
            folder
                ? {
                    id: `folder-${index}`,
                    kind: "folder",
                    title: `文件夹 ${index}`,
                    detail: `${3 + (index % 5)} 个应用`,
                }
                : {
                    id: `paper-${index}`,
                    kind: "paper",
                    title: `纸张 ${index}`,
                    detail: "一段固定到首页的笔记",
                    color: PAPER_COLORS[index % PAPER_COLORS.length],
                },
        );
    }
    return objects;
}

/** Stacks and large folders take two cells each way; everything else one. */
export function deskFootprint(
    object: DeskObject,
): { cols: 1 | 2; rows: 1 | 2 } {
    if (object.kind === "notes" || object.large) return { cols: 2, rows: 2 };
    if (object.kind === "conversations" || object.kind === "apps") {
        return { cols: 2, rows: 1 };
    }
    return { cols: 1, rows: 1 };
}

export type DeskCell = DesktopPlacement & { object: DeskObject };

/** Positions derive from canonical order; the desk stores none of its own. */
export function layoutDesk(
    objects: readonly DeskObject[],
    columns: number,
): DeskCell[] {
    const byId = new Map(objects.map((object) => [object.id, object]));
    return calculateDesktopLayout(
        objects.map((object) => ({ id: object.id, ...deskFootprint(object) })),
        columns,
    ).map((placement) => ({ ...placement, object: byId.get(placement.id)! }));
}

export function deskColumns(width: number, cell: number, gap: number): number {
    return Math.max(2, Math.floor((width + gap) / (cell + gap)));
}

/**
 * Spatial arrow-key neighbour. Candidates lie wholly beyond the current
 * cell's edge in the pressed direction; those sharing a row (or column) band
 * with it win, then the nearest edge, then the closest on the cross axis.
 */
export function deskNeighbour(
    cells: readonly DeskCell[],
    fromId: string,
    key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
): string | null {
    const from = cells.find((cell) => cell.id === fromId);
    if (!from) return cells[0]?.id ?? null;
    const horizontal = key === "ArrowLeft" || key === "ArrowRight";
    const span = (cell: DeskCell) =>
        horizontal
            ? { start: cell.row, end: cell.row + cell.rowSpan }
            : { start: cell.col, end: cell.col + cell.colSpan };
    const gap = (cell: DeskCell) => {
        if (key === "ArrowRight") return cell.col - (from.col + from.colSpan);
        if (key === "ArrowLeft") return from.col - (cell.col + cell.colSpan);
        if (key === "ArrowDown") return cell.row - (from.row + from.rowSpan);
        return from.row - (cell.row + cell.rowSpan);
    };
    const band = span(from);
    let best: { id: string; rank: [number, number, number] } | null = null;
    for (const cell of cells) {
        const distance = gap(cell);
        if (cell.id === fromId || distance < 0) continue;
        const other = span(cell);
        const overlaps = other.start < band.end && band.start < other.end;
        const offset = Math.abs(
            other.start + other.end - band.start - band.end,
        );
        const rank: [number, number, number] = [
            overlaps ? 0 : 1,
            distance,
            offset,
        ];
        if (
            !best || rank[0] < best.rank[0] ||
            (rank[0] === best.rank[0] &&
                (rank[1] < best.rank[1] ||
                    (rank[1] === best.rank[1] && rank[2] < best.rank[2])))
        ) best = { id: cell.id, rank };
    }
    return best?.id ?? null;
}

/** Wheel gestures accumulate within one burst; a pause or reversal resets. */
export type WheelBurst = { total: number; at: number };
export const WHEEL_BURST_GAP_MS = 200;
export const WHEEL_THRESHOLD = 80;
export const PINCH_WHEEL_THRESHOLD = 24;

export function normaliseWheelDelta(
    deltaY: number,
    deltaMode: number,
    pageHeight: number,
): number {
    if (deltaMode === 1) return deltaY * 16;
    if (deltaMode === 2) return deltaY * pageHeight;
    return deltaY;
}

/**
 * Maps one wheel event to a zoom intent. Positive delta moves away from the
 * desk (wheel down, pinch closed). Only the direction that changes the stage
 * is claimed: zooming in at 静 or out at 览 stays the browser's page zoom.
 * A plain wheel is claimed only when it would not scroll anything.
 */
export function wheelIntent(
    stage: DeskStage,
    event: { delta: number; ctrlKey: boolean; at: number },
    burst: WheelBurst,
    scrollable: { calm: boolean; overviewAtTop: boolean },
): { intent: ZoomIntent | null; claim: boolean; burst: WheelBurst } {
    const direction: ZoomIntent | null = event.delta > 0
        ? "out"
        : event.delta < 0
        ? "in"
        : null;
    const wanted: ZoomIntent | null = stage === "overview" ? "in" : "out";
    if (!direction || direction !== wanted) {
        return { intent: null, claim: false, burst: { total: 0, at: 0 } };
    }
    if (!event.ctrlKey) {
        if (stage !== "overview" && scrollable.calm) {
            return { intent: null, claim: false, burst: { total: 0, at: 0 } };
        }
        if (stage === "overview" && !scrollable.overviewAtTop) {
            return { intent: null, claim: false, burst: { total: 0, at: 0 } };
        }
    }
    const continues = event.at - burst.at <= WHEEL_BURST_GAP_MS &&
        Math.sign(burst.total) === Math.sign(event.delta);
    const total = (continues ? burst.total : 0) + event.delta;
    const threshold = event.ctrlKey ? PINCH_WHEEL_THRESHOLD : WHEEL_THRESHOLD;
    if (Math.abs(total) >= threshold) {
        return { intent: direction, claim: true, burst: { total: 0, at: 0 } };
    }
    return { intent: null, claim: true, burst: { total, at: event.at } };
}

/** Two-finger pinch: closing to 80% zooms out, opening to 125% zooms in. */
export function pinchIntent(
    stage: DeskStage,
    startDistance: number,
    distance: number,
    visualScale: number,
): ZoomIntent | null {
    if (startDistance <= 0 || visualScale > 1.01) return null;
    const ratio = distance / startDistance;
    if (stage !== "overview" && ratio <= 0.8) return "out";
    if (stage === "overview" && ratio >= 1.25) return "in";
    return null;
}
