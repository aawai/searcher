import {
    calculateDesktopLayout,
    type DesktopFootprint,
} from "./desktopLayout.ts";
import type { LauncherTile } from "./launcherTiles.ts";

export const HOME_MAX_ROWS = 4;
export const HOME_BOTTOM_CLEARANCE = 48;

const ADD_ID = "\u0000home-library-add";

/** Number of grid rows that fit between the grid top and the viewport bottom. */
export function effectiveRows(
    {
        layoutViewportHeight,
        gridTop,
        rowPitch,
        bottomClearance = HOME_BOTTOM_CLEARANCE,
        maxRows = HOME_MAX_ROWS,
    }: {
        layoutViewportHeight: number;
        gridTop: number;
        rowPitch: number;
        bottomClearance?: number;
        maxRows?: number;
    },
): number {
    if (!Number.isFinite(rowPitch) || rowPitch <= 0) return 1;
    const raw = Math.floor(
        (layoutViewportHeight - gridTop - bottomClearance) / rowPitch,
    );
    if (!Number.isFinite(raw)) return 1;
    return Math.min(Math.max(raw, 1), maxRows);
}

export interface HomeLibraryVisibleItem {
    tile: LauncherTile;
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
}

export interface HomeLibraryPlan {
    /** Visual order: sorted by row, then column. */
    visible: HomeLibraryVisibleItem[];
    /** Tiles that did not fit, in canonical order. */
    overflow: LauncherTile[];
    /** The "more" cell; `count` is the number of overflow tiles (add excluded). */
    more: { col: number; row: number; count: number } | null;
    add: { col: number; row: number } | null;
    /** True when the add action was pushed into the overflow view. */
    addInOverflow: boolean;
}

function footprint(tile: LauncherTile): DesktopFootprint {
    const large = tile.type === "folder" && tile.group.folderSize === "large";
    return { id: tile.id, cols: large ? 2 : 1, rows: large ? 2 : 1 };
}

/**
 * Plan the home library inside a `columns` x `rows` area.
 *
 * All tiles (plus a trailing 1x1 add cell when `showAdd`) are laid out in
 * canonical order with backfill. If everything fits, there is no overflow.
 * Otherwise the last cell of the area is reserved for the "more" cell and the
 * tiles are laid out again; tiles that no longer fit go to overflow and the add
 * action moves into the overflow view. When only the add cell failed to fit,
 * every cell of the area is already taken by tiles, so the reserved cell
 * necessarily displaces at least one tile and `more.count >= 1`.
 */
export function planHomeLibrary(
    { tiles, columns, rows, showAdd }: {
        tiles: LauncherTile[];
        columns: number;
        rows: number;
        showAdd: boolean;
    },
): HomeLibraryPlan {
    const cols = Math.max(2, Math.floor(columns));
    const maxRows = Math.max(1, Math.floor(rows));
    const items = tiles.map(footprint);
    const byId = new Map(tiles.map((t) => [t.id, t]));
    const visualSort = <T extends { col: number; row: number }>(list: T[]) =>
        list.sort((a, b) => a.row - b.row || a.col - b.col);
    const toVisible = (
        placements: ReturnType<typeof calculateDesktopLayout>,
    ) => visualSort(
        placements.map((p) => ({
            tile: byId.get(p.id)!,
            col: p.col,
            row: p.row,
            colSpan: p.colSpan,
            rowSpan: p.rowSpan,
        })),
    );

    const full = calculateDesktopLayout(
        showAdd ? [...items, { id: ADD_ID, cols: 1, rows: 1 }] : items,
        cols,
    );
    if (full.every((p) => p.row + p.rowSpan <= maxRows)) {
        const addPlacement = full.find((p) => p.id === ADD_ID);
        return {
            visible: toVisible(full.filter((p) => p.id !== ADD_ID)),
            overflow: [],
            more: null,
            add: addPlacement
                ? { col: addPlacement.col, row: addPlacement.row }
                : null,
            addInOverflow: false,
        };
    }

    const moreCell = { col: cols - 1, row: maxRows - 1 };
    const placed = calculateDesktopLayout(items, cols, [moreCell]);
    const fitting = new Set(
        placed.filter((p) => p.row + p.rowSpan <= maxRows).map((p) => p.id),
    );
    const overflow = tiles.filter((t) => !fitting.has(t.id));
    return {
        visible: toVisible(placed.filter((p) => fitting.has(p.id))),
        overflow,
        more: { ...moreCell, count: overflow.length },
        add: null,
        addInOverflow: showAdd,
    };
}

/**
 * Keyboard move expressed in visual order, mapped back to canonical order: the
 * moved tile lands directly before (-1) / after (+1) its visual neighbour in
 * the canonical list. No-op at the ends or for unknown ids.
 */
export function moveInVisualOrder(
    canonicalIds: string[],
    visualIds: string[],
    id: string,
    direction: -1 | 1,
): string[] {
    const index = visualIds.indexOf(id);
    const neighbour = visualIds[index + direction];
    if (index < 0 || neighbour === undefined || !canonicalIds.includes(id)) {
        return canonicalIds.slice();
    }
    const rest = canonicalIds.filter((x) => x !== id);
    const at = rest.indexOf(neighbour);
    if (at < 0) return canonicalIds.slice();
    rest.splice(direction === -1 ? at : at + 1, 0, id);
    return rest;
}
