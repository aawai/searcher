/**
 * Pure lattice math for notes pinned to the home surface (#285 Y3).
 *
 * Notes sit beside the search box and the app plate: columns are anchored at
 * the block's outer edges and grow outward, rows start at the search box's top
 * edge. The caller measures that geometry; nothing here touches the DOM, so the
 * same functions serve the prototype and the Y3-I implementation.
 */
import { type DocumentNoteSize, HOME_NOTE_SPANS } from "@shared/documents.ts";

export interface Cell {
    col: number;
    row: number;
}

/** A cell origin plus its span in cells. */
export interface CellRect extends Cell {
    cols: number;
    rows: number;
}

export interface PixelRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * One lattice column. `band` names the side of the block the column belongs to
 * so a resize can fold a cell back into the same side, not merely the same index.
 */
export interface GridColumn {
    x: number;
    band: string;
}

export interface CellGrid {
    columns: readonly GridColumn[];
    /** Top edge of row 0, in the same coordinate space as the rendered cells. */
    top: number;
    rows: number;
    cell: number;
    gap: number;
}

export interface FoldResult<T extends CellRect> {
    placed: T[];
    overflow: T[];
}

export function pitch(grid: CellGrid): number {
    return grid.cell + grid.gap;
}

function clampIndex(index: number, count: number): number {
    if (!Number.isFinite(index)) return 0;
    return Math.min(Math.max(Math.trunc(index), 0), Math.max(0, count - 1));
}

/** Home rows stop this far above the viewport bottom (Y4-C4). */
export const HOME_BOTTOM_CLEARANCE = 48;

/** The search box centre sits at 38% of the viewport (VISUAL_LANGUAGE home prototype). */
export const HOME_SEARCH_ANCHOR = 0.38;

export interface HomeBlockGeometry {
    /** Left edge of the search box / app plate. */
    left: number;
    width: number;
    /** Top edge of the search box after composition. */
    top: number;
    viewportWidth: number;
    viewportHeight: number;
    cell: number;
    gap: number;
    /** Page margin that notes must stay inside. */
    inset: number;
    bottomClearance?: number;
}

/**
 * Columns grow outward from the block's outer edges with the shared cell and
 * gap, rows start at the search box top. The block itself is not part of the
 * lattice: callers pass it as a pixel obstacle.
 */
export function homeGridFromBlock(geometry: HomeBlockGeometry): CellGrid {
    const step = geometry.cell + geometry.gap;
    const clearance = geometry.bottomClearance ?? HOME_BOTTOM_CLEARANCE;
    const leftColumns: GridColumn[] = [];
    for (
        let x = geometry.left - geometry.gap - geometry.cell;
        x >= geometry.inset - 0.5;
        x -= step
    ) {
        leftColumns.unshift({ x, band: "left" });
    }
    const rightColumns: GridColumn[] = [];
    for (
        let x = geometry.left + geometry.width + geometry.gap;
        x + geometry.cell <= geometry.viewportWidth - geometry.inset + 0.5;
        x += step
    ) {
        rightColumns.push({ x, band: "right" });
    }
    const rows = Math.max(
        0,
        Math.floor(
            (geometry.viewportHeight - clearance - geometry.top +
                geometry.gap) / step,
        ),
    );
    return {
        columns: [...leftColumns, ...rightColumns],
        top: geometry.top,
        rows,
        cell: geometry.cell,
        gap: geometry.gap,
    };
}

export interface CompositionOptions {
    viewportHeight: number;
    searchHeight: number;
    blockHeight: number;
    /** Request the lower third when the wallpaper subject is centred. */
    lowerThird?: boolean;
    /** Baseline share of the viewport for the search centre. */
    anchorRatio?: number;
    bottomClearance?: number;
    /** Lowest allowed top edge; the prototype reserves room for its controls. */
    minTop?: number;
}

/**
 * Top edge for the search + plate block. The 38% anchor is the baseline; the
 * lower-third request is a lower bound of that baseline and an upper bound of
 * the viewport bottom minus the block and the 48px clearance.
 */
export function composeBlockTop(options: CompositionOptions): number {
    const anchor = options.anchorRatio ?? HOME_SEARCH_ANCHOR;
    const clearance = options.bottomClearance ?? HOME_BOTTOM_CLEARANCE;
    const baseline = options.viewportHeight * anchor -
        options.searchHeight / 2;
    const lower = (options.viewportHeight * 2) / 3 - options.searchHeight / 2;
    const requested = options.lowerThird ? Math.max(baseline, lower) : baseline;
    const maximum = options.viewportHeight - clearance - options.blockHeight;
    return Math.round(
        Math.max(
            options.minTop ?? 0,
            Math.min(requested, maximum),
        ),
    );
}

/**
 * Pixel bounds of a cell span. Spans are contiguous inside one band, so the
 * width is `cols` cells plus the gaps between them. Out-of-range origins clamp
 * to the nearest column or row: a drag preview must stay on screen.
 */
export function cellToPixels(rect: CellRect, grid: CellGrid): PixelRect {
    const col = clampIndex(rect.col, grid.columns.length);
    const row = clampIndex(rect.row, grid.rows);
    return {
        x: grid.columns[col]?.x ?? 0,
        y: grid.top + row * pitch(grid),
        width: rect.cols * grid.cell + (rect.cols - 1) * grid.gap,
        height: rect.rows * grid.cell + (rect.rows - 1) * grid.gap,
    };
}

/** Nearest cell origin to a pixel point; drag previews use the column centre. */
export function pixelsToCell(
    point: { x: number; y: number },
    grid: CellGrid,
): Cell {
    let best = 0;
    let distance = Infinity;
    grid.columns.forEach((column, index) => {
        const next = Math.abs(point.x - (column.x + grid.cell / 2));
        if (next < distance) {
            distance = next;
            best = index;
        }
    });
    return {
        col: best,
        row: clampIndex(
            Math.round((point.y - grid.top) / pitch(grid)),
            grid.rows,
        ),
    };
}

/** Half-open bounds: touching edges are not a collision. */
export function intersects(a: PixelRect, b: PixelRect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
}

/** In bounds and, for spans, entirely inside a single band. */
export function fits(rect: CellRect, grid: CellGrid): boolean {
    if (!Number.isInteger(rect.cols) || !Number.isInteger(rect.rows)) {
        return false;
    }
    if (rect.cols < 1 || rect.rows < 1) return false;
    if (rect.col < 0 || rect.row < 0) return false;
    if (rect.col + rect.cols > grid.columns.length) return false;
    if (rect.row + rect.rows > grid.rows) return false;
    const band = grid.columns[rect.col].band;
    for (let col = rect.col + 1; col < rect.col + rect.cols; col++) {
        if (grid.columns[col].band !== band) return false;
    }
    return true;
}

/** True when the span is in bounds, clear of obstacles and of occupied cells. */
export function isFree(
    rect: CellRect,
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[],
): boolean {
    if (!fits(rect, grid)) return false;
    const pixels = cellToPixels(rect, grid);
    if (obstacles.some((obstacle) => intersects(pixels, obstacle))) {
        return false;
    }
    return occupied.every((cell) =>
        !intersects(pixels, cellToPixels(cell, grid))
    );
}

/** Every free span origin in reading order: rows top-down, then columns. */
export function freeCells(
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[],
    span: { cols: number; rows: number } = { cols: 1, rows: 1 },
): CellRect[] {
    const cells: CellRect[] = [];
    for (let row = 0; row + span.rows <= grid.rows; row++) {
        for (let col = 0; col + span.cols <= grid.columns.length; col++) {
            const candidate = { col, row, cols: span.cols, rows: span.rows };
            if (isFree(candidate, grid, occupied, obstacles)) {
                cells.push(candidate);
            }
        }
    }
    return cells;
}

/**
 * Non-overlapping capacity for one span size. A span never crosses a band, so
 * each band contributes `floor(columns / span.cols) * floor(rows / span.rows)`.
 */
export function cellCapacity(
    grid: CellGrid,
    span: { cols: number; rows: number },
): number {
    if (span.cols < 1 || span.rows < 1) return 0;
    const bands = new Map<string, number>();
    for (const column of grid.columns) {
        bands.set(column.band, (bands.get(column.band) ?? 0) + 1);
    }
    let total = 0;
    for (const count of bands.values()) {
        total += Math.floor(count / span.cols) *
            Math.floor(grid.rows / span.rows);
    }
    return total;
}

/** Euclidean nearest free cell; ties resolve in reading order. */
export function nearestFreeCell(
    target: CellRect,
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[],
): CellRect | null {
    let best: CellRect | null = null;
    let bestDistance = Infinity;
    for (let row = 0; row + target.rows <= grid.rows; row++) {
        for (let col = 0; col + target.cols <= grid.columns.length; col++) {
            const distance = (col - target.col) ** 2 + (row - target.row) ** 2;
            if (distance >= bestDistance) continue;
            const candidate = { ...target, col, row };
            if (!isFree(candidate, grid, occupied, obstacles)) continue;
            best = candidate;
            bestDistance = distance;
        }
    }
    return best;
}

function bandRange(
    grid: CellGrid,
    band: string,
): { start: number; count: number } | null {
    let start = -1;
    let count = 0;
    grid.columns.forEach((column, index) => {
        if (column.band !== band) return;
        if (start === -1) start = index;
        count++;
    });
    return start === -1 ? null : { start, count };
}

function foldColumn(
    note: CellRect,
    from: CellGrid | null,
    to: CellGrid,
): number {
    const band = from && note.col >= 0 && note.col < from.columns.length
        ? from.columns[note.col].band
        : null;
    const source = band && from ? bandRange(from, band) : null;
    const target = band ? bandRange(to, band) : null;
    if (source && target && target.count >= note.cols) {
        const offset = note.col - source.start;
        return target.start +
            Math.min(Math.max(offset, 0), target.count - note.cols);
    }
    return Math.min(
        Math.max(note.col, 0),
        Math.max(0, to.columns.length - note.cols),
    );
}

/**
 * Projects cells stored for `from` onto `to` after the viewport changed. A note
 * keeps its band and its offset from that band's inner edge, rows clamp to the
 * new height, collisions resolve to the nearest free cell, and notes that no
 * longer fit are reported as overflow instead of being dropped.
 */
export function foldColumns<T extends CellRect>(
    notes: readonly T[],
    from: CellGrid | null,
    to: CellGrid,
    obstacles: readonly PixelRect[],
): FoldResult<T> {
    const placed: T[] = [];
    const overflow: T[] = [];
    for (const note of notes) {
        const col = foldColumn(note, from, to);
        const row = Math.min(
            Math.max(note.row, 0),
            Math.max(0, to.rows - note.rows),
        );
        const free = nearestFreeCell(
            { ...note, col, row },
            to,
            placed,
            obstacles,
        );
        if (free) placed.push({ ...note, ...free });
        else overflow.push(note);
    }
    return { placed, overflow };
}

/** One home note as the server stores it: an optional cell plus a size tier. */
export interface HomeNoteCell {
    id: string;
    size: DocumentNoteSize;
    col: number | null;
    row: number | null;
}

/** A placed note carries its rendered span; a W may render as S. */
export interface PlacedHomeNote<T extends HomeNoteCell> extends CellRect {
    note: T;
}

export interface PlaceHomeNotesOptions {
    /** The grid the saved cells were measured on, when the viewport changes. */
    from?: CellGrid | null;
    obstacles?: readonly PixelRect[];
}

function bandMembers(grid: CellGrid): Map<string, number[]> {
    const bands = new Map<string, number[]>();
    grid.columns.forEach((column, index) => {
        const members = bands.get(column.band) ?? [];
        members.push(index);
        bands.set(column.band, members);
    });
    return bands;
}

/** Band indices ordered from the search/plate edge outward. */
function innerFirst(
    members: readonly number[],
    band: string,
): readonly number[] {
    return band === "left" ? [...members].reverse() : members;
}

/** First free span inside one band, rows top-down and columns inner-first. */
function firstFreeInBand(
    span: { cols: number; rows: number },
    band: string,
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[],
): CellRect | null {
    const members = bandMembers(grid).get(band) ?? [];
    if (members.length < span.cols) return null;
    const order = innerFirst(members, band);
    for (let row = 0; row + span.rows <= grid.rows; row++) {
        for (let offset = 0; offset + span.cols <= order.length; offset++) {
            const start = order[offset];
            const end = order[offset + span.cols - 1];
            // A contiguous span must also be contiguous in the column array.
            if (Math.abs(end - start) !== span.cols - 1) continue;
            const candidate = { col: Math.min(start, end), row, ...span };
            if (isFree(candidate, grid, occupied, obstacles)) return candidate;
        }
    }
    return null;
}

/**
 * Resolves one note at the requested cell: the exact cell when free, else the
 * nearest free cell. A W that cannot fit is rendered as S; the stored tier is
 * preserved so the size menu still reflects the user's choice.
 */
function placeAt(
    note: HomeNoteCell,
    target: { col: number; row: number },
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[],
): { cell: CellRect; size: DocumentNoteSize } | null {
    for (
        const size of note.size === "w" ? ["w", "s"] as const : ["s"] as const
    ) {
        const span = HOME_NOTE_SPANS[size];
        const cell = nearestFreeCell(
            { col: target.col, row: target.row, ...span },
            grid,
            occupied,
            obstacles,
        );
        if (cell) return { cell, size };
    }
    return null;
}

function foldedTarget(
    note: HomeNoteCell,
    from: CellGrid | null | undefined,
    grid: CellGrid,
): { col: number; row: number } {
    const col = note.col === null ? 0 : note.col;
    const row = note.row === null ? 0 : note.row;
    if (!from) {
        return {
            col: Math.min(
                Math.max(col, 0),
                Math.max(0, grid.columns.length - 1),
            ),
            row: Math.min(Math.max(row, 0), Math.max(0, grid.rows - 1)),
        };
    }
    return {
        col: foldColumn({ col, row, cols: 1, rows: 1 }, from, grid),
        row: Math.min(Math.max(row, 0), Math.max(0, grid.rows - 1)),
    };
}

/**
 * Places home notes in `homeSortOrder`. Saved cells keep their band and offset
 * from it; notes without cells alternate between the sides, filling each from
 * the plate outward, top first. Notes that do not fit are returned as overflow
 * instead of being squeezed elsewhere.
 */
export function placeHomeNotes<T extends HomeNoteCell>(
    notes: readonly T[],
    grid: CellGrid,
    options: PlaceHomeNotesOptions = {},
): { placed: PlacedHomeNote<T>[]; overflow: T[] } {
    const obstacles = options.obstacles ?? [];
    const occupied: CellRect[] = [];
    const placed: PlacedHomeNote<T>[] = [];
    const overflow: T[] = [];
    let preferred: "left" | "right" = "left";
    for (const note of notes) {
        let chosen: { cell: CellRect; size: DocumentNoteSize } | null = null;
        if (note.col !== null && note.row !== null) {
            chosen = placeAt(
                note,
                foldedTarget(note, options.from, grid),
                grid,
                occupied,
                obstacles,
            );
        } else {
            for (
                const band of [
                    preferred,
                    preferred === "left" ? "right" : "left",
                ]
            ) {
                const size = note.size;
                const span = HOME_NOTE_SPANS[size];
                const members = (bandMembers(grid).get(band) ?? []).length;
                const attempt = size === "w" && members < 2
                    ? { cols: 1, rows: 1 }
                    : span;
                const cell = firstFreeInBand(
                    attempt,
                    band,
                    grid,
                    occupied,
                    obstacles,
                );
                if (!cell) continue;
                chosen = { cell, size: attempt.cols === 2 ? "w" : "s" };
                break;
            }
            preferred = preferred === "left" ? "right" : "left";
        }
        if (!chosen) {
            overflow.push(note);
            continue;
        }
        placed.push({ note, ...chosen.cell });
        occupied.push(chosen.cell);
    }
    return { placed, overflow };
}

/** Resolves a drag/keyboard target for one note, excluding itself from `occupied`. */
export function resolveHomeNoteCell(
    note: HomeNoteCell,
    target: { col: number; row: number },
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[] = [],
): { cell: CellRect; size: DocumentNoteSize } | null {
    return placeAt(note, target, grid, occupied, obstacles);
}
