import type { DocumentColor } from "@shared/documents.ts";
import {
    calculateDesktopLayout,
    type DesktopPlacement,
} from "../../components/searcher/desktopLayout.ts";
import type { LauncherTile } from "../../components/searcher/launcherTiles.ts";
import type { WebAppItem } from "../../components/searcher/WebAppIcon.tsx";

export type DeskObjectKind =
    | "notes"
    | "conversations"
    | "apps"
    | "folder"
    | "paper";

/**
 * One object on the desk. Ids are stable across loads: `notes`,
 * `conversations`, `apps`, `folder:<group id>` and `paper:<document id>`.
 */
export interface DeskObject {
    id: string;
    kind: DeskObjectKind;
    title: string;
    /** Secondary line: a count, the latest item or the kind. */
    detail: string;
    /** A large folder: 2×2 cells. */
    large?: boolean;
    color?: DocumentColor;
    /** Leading titles the tile previews (notes, conversations). */
    preview: readonly string[];
    /** Apps in a cluster, in library order. */
    apps?: readonly WebAppItem[];
}

export const DESK_KIND_LABEL: Record<DeskObjectKind, string> = {
    notes: "笔记",
    conversations: "AI 对话",
    apps: "应用",
    folder: "文件夹",
    paper: "首页纸张",
};

/** List sections in canonical order. */
export const DESK_KIND_ORDER: readonly DeskObjectKind[] = [
    "notes",
    "conversations",
    "apps",
    "folder",
    "paper",
];

/**
 * Above this many objects 览 degrades to the grouped list. Measured in #240 P:
 * up to 144 objects the longest transition frame under a 4× CPU throttle
 * matched the 7-object baseline; 96 is the largest count measured twice.
 */
export const DESK_OBJECT_LIMIT = 96;
export const DESK_NOTES_PREVIEW = 4;
export const DESK_CONVERSATIONS_PREVIEW = 2;

export interface DeskSources {
    /** Most recently edited notes first. */
    recentNotes: readonly { displayTitle: string }[];
    /** Most recent first; `null` hides the conversations object. */
    conversations: readonly { title: string }[] | null;
    /** Root tiles in the canonical library order (`launcherTiles`). */
    tiles: readonly LauncherTile[];
    /** Home papers in home order. */
    papers: readonly {
        id: string;
        displayTitle: string;
        color: DocumentColor;
    }[];
}

/** Canonical order: notes, conversations, loose apps, folders, papers. */
export function buildDeskObjects(sources: DeskSources): DeskObject[] {
    const latestNote = sources.recentNotes[0]?.displayTitle;
    const objects: DeskObject[] = [{
        id: "notes",
        kind: "notes",
        title: "笔记",
        detail: latestNote ? `最近：${latestNote}` : "还没有笔记",
        preview: sources.recentNotes.slice(0, DESK_NOTES_PREVIEW).map((note) =>
            note.displayTitle
        ),
    }];
    if (sources.conversations) {
        const count = sources.conversations.length;
        objects.push({
            id: "conversations",
            kind: "conversations",
            title: "AI 对话",
            detail: count > 0 ? `${count} 个对话` : "还没有对话",
            preview: sources.conversations.slice(
                0,
                DESK_CONVERSATIONS_PREVIEW,
            ).map((conversation) => conversation.title),
        });
    }
    const loose = sources.tiles.flatMap((tile) =>
        tile.type === "app" ? [tile.app] : []
    );
    if (loose.length > 0) {
        objects.push({
            id: "apps",
            kind: "apps",
            title: "应用",
            detail: `${loose.length} 个应用`,
            preview: [],
            apps: loose,
        });
    }
    for (const tile of sources.tiles) {
        if (tile.type !== "folder") continue;
        objects.push({
            id: `folder:${tile.group.id}`,
            kind: "folder",
            title: tile.group.name,
            detail: `${tile.apps.length} 个应用`,
            large: tile.group.folderSize === "large",
            preview: [],
            apps: tile.apps,
        });
    }
    for (const paper of sources.papers) {
        objects.push({
            id: `paper:${paper.id}`,
            kind: "paper",
            title: paper.displayTitle,
            detail: DESK_KIND_LABEL.paper,
            color: paper.color,
            preview: [],
        });
    }
    return objects;
}

/** Stacks and large folders take two cells each way; everything else one. */
export function deskFootprint(
    object: Pick<DeskObject, "kind" | "large">,
): { cols: 1 | 2; rows: 1 | 2 } {
    if (object.kind === "notes" || object.large) return { cols: 2, rows: 2 };
    if (object.kind === "conversations" || object.kind === "apps") {
        return { cols: 2, rows: 1 };
    }
    return { cols: 1, rows: 1 };
}

export type DeskCell<T extends Pick<DeskObject, "id" | "kind" | "large">> =
    & DesktopPlacement
    & { object: T };

/** Positions derive from canonical order; the desk stores none of its own. */
export function layoutDesk<T extends Pick<DeskObject, "id" | "kind" | "large">>(
    objects: readonly T[],
    columns: number,
): DeskCell<T>[] {
    const byId = new Map(objects.map((object) => [object.id, object]));
    return calculateDesktopLayout(
        objects.map((object) => ({ id: object.id, ...deskFootprint(object) })),
        columns,
    ).map((placement) => ({ ...placement, object: byId.get(placement.id)! }));
}

export function deskColumns(width: number, cell: number, gap: number): number {
    return Math.max(2, Math.floor((width + gap) / (cell + gap)));
}

export type DeskArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export function isDeskArrowKey(key: string): key is DeskArrowKey {
    return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" ||
        key === "ArrowRight";
}

/**
 * Spatial arrow-key neighbour. Candidates lie wholly beyond the current
 * cell's edge in the pressed direction; those sharing a row (or column) band
 * with it win, then the nearest edge, then the closest on the cross axis.
 */
export function deskNeighbour(
    cells: readonly DesktopPlacement[],
    fromId: string,
    key: DeskArrowKey,
): string | null {
    const from = cells.find((cell) => cell.id === fromId);
    if (!from) return cells[0]?.id ?? null;
    const horizontal = key === "ArrowLeft" || key === "ArrowRight";
    const span = (cell: DesktopPlacement) =>
        horizontal
            ? { start: cell.row, end: cell.row + cell.rowSpan }
            : { start: cell.col, end: cell.col + cell.colSpan };
    const gap = (cell: DesktopPlacement) => {
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

export type ZoomIntent = "out" | "in";

/** Wheel gestures accumulate within one burst; a pause or reversal resets. */
export type WheelBurst = { total: number; at: number };
export const IDLE_WHEEL_BURST: WheelBurst = { total: 0, at: 0 };
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
 * is claimed: zooming in at 静 or out at 览 stays the browser's page zoom. A
 * plain wheel is claimed only when it would not scroll anything.
 */
export function wheelIntent(
    overview: boolean,
    event: { delta: number; ctrlKey: boolean; at: number },
    burst: WheelBurst,
    scroll: { scrollable: boolean; atTop: boolean },
): { intent: ZoomIntent | null; claim: boolean; burst: WheelBurst } {
    const ignored = { intent: null, claim: false, burst: IDLE_WHEEL_BURST };
    const direction: ZoomIntent | null = event.delta > 0
        ? "out"
        : event.delta < 0
        ? "in"
        : null;
    if (!direction || direction !== (overview ? "in" : "out")) return ignored;
    if (!event.ctrlKey && (overview ? !scroll.atTop : scroll.scrollable)) {
        return ignored;
    }
    const continues = event.at - burst.at <= WHEEL_BURST_GAP_MS &&
        Math.sign(burst.total) === Math.sign(event.delta);
    const total = (continues ? burst.total : 0) + event.delta;
    const threshold = event.ctrlKey ? PINCH_WHEEL_THRESHOLD : WHEEL_THRESHOLD;
    if (Math.abs(total) >= threshold) {
        return { intent: direction, claim: true, burst: IDLE_WHEEL_BURST };
    }
    return { intent: null, claim: true, burst: { total, at: event.at } };
}

/** Two-finger pinch: closing to 80% zooms out, opening to 125% zooms in. */
export function pinchIntent(
    overview: boolean,
    startDistance: number,
    distance: number,
    visualScale: number,
): ZoomIntent | null {
    if (startDistance <= 0 || visualScale > 1.01) return null;
    const ratio = distance / startDistance;
    if (!overview && ratio <= 0.8) return "out";
    if (overview && ratio >= 1.25) return "in";
    return null;
}
