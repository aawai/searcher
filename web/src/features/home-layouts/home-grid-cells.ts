/**
 * Pure lattice math for notes pinned to the home surface.
 *
 * Notes live in three bands around the search box + app plate block (see
 * `HomeNoteBand`): the side bands grow outward from the block's outer edges
 * with rows phased on the search box top (and continuing above it), the
 * centre shelf sits below the block. Cells are band-relative, so a saved cell
 * means the same place at every viewport. The caller measures the geometry;
 * nothing here touches the DOM.
 */
import {
    type DocumentNoteSize,
    HOME_NOTE_GRID_MAX_ROW,
    HOME_NOTE_SPANS,
    type HomeNoteBand,
    homeNoteCellsOverlap,
} from "@shared/documents.ts";

export type Band = HomeNoteBand;

export interface Cell {
    band: Band;
    col: number;
    row: number;
}

/** A cell origin plus its span in cells. */
export interface CellRect extends Cell {
    cols: number;
    rows: number;
}

export interface Span {
    cols: number;
    rows: number;
}

export interface PixelRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

/** One band of the lattice. Only bands with at least one cell are listed. */
export interface BandGrid {
    band: Band;
    /**
     * Left edge of each column by band offset: side bands run from the block
     * outward, the shelf runs left to right.
     */
    columns: readonly number[];
    /** Top edge of row 0. */
    top: number;
    /** Inclusive lowest row; side bands may start above the search box. */
    minRow: number;
    /** Exclusive highest row. */
    maxRow: number;
}

export interface CellGrid {
    bands: readonly BandGrid[];
    cell: number;
    gap: number;
}

export function pitch(grid: CellGrid): number {
    return grid.cell + grid.gap;
}

/** Home rows stop this far above the viewport bottom (Y4-C4). */
export const HOME_BOTTOM_CLEARANCE = 48;

/** The search box centre sits at 38% of the viewport (VISUAL_LANGUAGE home prototype). */
export const HOME_SEARCH_ANCHOR = 0.38;

export interface HomeBlockGeometry {
    /** Left edge of the search box / app plate. */
    left: number;
    width: number;
    /** Top edge of the search box; side rows are phased on it. */
    searchTop: number;
    /** Bottom edge of the app plate, or of the search box without a plate. */
    blockBottom: number;
    /** Lowest y a note may start at (the top bar bottom plus one gap). */
    topLimit: number;
    /** Vertical distance from the block to the shelf (search → plate rhythm). */
    shelfGap: number;
    viewportWidth: number;
    viewportHeight: number;
    cell: number;
    gap: number;
    /** Page margin that notes must stay inside. */
    inset: number;
    bottomClearance?: number;
}

function rowsBelow(
    top: number,
    geometry: HomeBlockGeometry,
    step: number,
): number {
    const clearance = geometry.bottomClearance ?? HOME_BOTTOM_CLEARANCE;
    return Math.min(
        HOME_NOTE_GRID_MAX_ROW + 1,
        Math.max(
            0,
            Math.floor(
                (geometry.viewportHeight - clearance - top + geometry.gap) /
                    step,
            ),
        ),
    );
}

/**
 * Side columns grow outward from the block's outer edges with the shared cell
 * and gap; their rows are phased on the search box top and continue up to the
 * top limit and down to the bottom clearance. The shelf centres whole cells
 * under the block. The block itself is not part of the lattice: callers pass
 * it (and anything else drawn there) as pixel obstacles.
 */
export function homeGridFromBlock(geometry: HomeBlockGeometry): CellGrid {
    const step = geometry.cell + geometry.gap;
    const left: number[] = [];
    for (
        let x = geometry.left - geometry.gap - geometry.cell;
        x >= geometry.inset - 0.5;
        x -= step
    ) {
        left.push(x);
    }
    const right: number[] = [];
    for (
        let x = geometry.left + geometry.width + geometry.gap;
        x + geometry.cell <= geometry.viewportWidth - geometry.inset + 0.5;
        x += step
    ) {
        right.push(x);
    }
    const sideMinRow = Math.max(
        -HOME_NOTE_GRID_MAX_ROW,
        Math.min(
            0,
            Math.ceil((geometry.topLimit - geometry.searchTop - 0.5) / step),
        ),
    );
    const sideMaxRow = rowsBelow(geometry.searchTop, geometry, step);
    const shelfCount = Math.max(
        0,
        Math.floor((geometry.width + geometry.gap) / step),
    );
    const shelfWidth = shelfCount * step - geometry.gap;
    const shelfLeft = geometry.left + (geometry.width - shelfWidth) / 2;
    const shelfTop = geometry.blockBottom + geometry.shelfGap;
    const bands: BandGrid[] = [
        {
            band: "left",
            columns: left,
            top: geometry.searchTop,
            minRow: sideMinRow,
            maxRow: sideMaxRow,
        },
        {
            band: "right",
            columns: right,
            top: geometry.searchTop,
            minRow: sideMinRow,
            maxRow: sideMaxRow,
        },
        {
            band: "center",
            columns: Array.from(
                { length: shelfCount },
                (_, index) => shelfLeft + index * step,
            ),
            top: shelfTop,
            minRow: 0,
            maxRow: rowsBelow(shelfTop, geometry, step),
        },
    ];
    return {
        bands: bands.filter((band) =>
            band.columns.length > 0 && band.maxRow > band.minRow
        ),
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

export function bandOf(grid: CellGrid, band: Band): BandGrid | undefined {
    return grid.bands.find((item) => item.band === band);
}

/** In bounds of an existing band, as a contiguous span. */
export function fits(rect: CellRect, grid: CellGrid): boolean {
    const band = bandOf(grid, rect.band);
    if (!band) return false;
    if (
        !Number.isInteger(rect.col) || !Number.isInteger(rect.row) ||
        !Number.isInteger(rect.cols) || !Number.isInteger(rect.rows)
    ) {
        return false;
    }
    if (rect.cols < 1 || rect.rows < 1) return false;
    return rect.col >= 0 && rect.col + rect.cols <= band.columns.length &&
        rect.row >= band.minRow && rect.row + rect.rows <= band.maxRow;
}

/**
 * Pixel bounds of a fitting span. Side spans grow away from the block, so a
 * left-band W starts at its outer column.
 */
export function cellToPixels(rect: CellRect, grid: CellGrid): PixelRect {
    const band = bandOf(grid, rect.band);
    if (!band || !fits(rect, grid)) {
        throw new RangeError(
            `Cell ${rect.band}:${rect.col},${rect.row} is outside the lattice`,
        );
    }
    const x = rect.band === "left"
        ? band.columns[rect.col + rect.cols - 1]
        : band.columns[rect.col];
    return {
        x,
        y: band.top + rect.row * pitch(grid),
        width: rect.cols * grid.cell + (rect.cols - 1) * grid.gap,
        height: rect.rows * grid.cell + (rect.rows - 1) * grid.gap,
    };
}

/** Half-open bounds: touching edges are not a collision. */
export function intersects(a: PixelRect, b: PixelRect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
}

/** True when the span fits, is clear of obstacles and of occupied cells. */
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

/** Every fitting origin for a span, in reading order (top-down, left-right). */
export function allCells(grid: CellGrid, span: Span): CellRect[] {
    const cells: Array<{ cell: CellRect; pixels: PixelRect }> = [];
    for (const band of grid.bands) {
        for (let row = band.minRow; row + span.rows <= band.maxRow; row++) {
            for (
                let col = 0;
                col + span.cols <= band.columns.length;
                col++
            ) {
                const cell = {
                    band: band.band,
                    col,
                    row,
                    cols: span.cols,
                    rows: span.rows,
                };
                cells.push({ cell, pixels: cellToPixels(cell, grid) });
            }
        }
    }
    return cells
        .sort((a, b) => a.pixels.y - b.pixels.y || a.pixels.x - b.pixels.x)
        .map((item) => item.cell);
}

/** Every free span origin in reading order. */
export function freeCells(
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[],
    span: Span = HOME_NOTE_SPANS.s,
): CellRect[] {
    return allCells(grid, span).filter((cell) =>
        isFree(cell, grid, occupied, obstacles)
    );
}

/**
 * Non-overlapping capacity for one span size, ignoring obstacles. A span never
 * crosses a band, so each band contributes `floor(columns / cols) * floor(rows / rows)`.
 */
export function cellCapacity(grid: CellGrid, span: Span): number {
    if (span.cols < 1 || span.rows < 1) return 0;
    return grid.bands.reduce(
        (total, band) =>
            total +
            Math.floor(band.columns.length / span.cols) *
                Math.floor((band.maxRow - band.minRow) / span.rows),
        0,
    );
}

function distance(a: Point, b: Point): number {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/** Fitting origin whose top-left is nearest to a pixel point; ties keep reading order. */
export function nearestCell(
    point: Point,
    grid: CellGrid,
    span: Span,
    accept: (cell: CellRect) => boolean = () => true,
): CellRect | null {
    let best: CellRect | null = null;
    let bestDistance = Infinity;
    for (const cell of allCells(grid, span)) {
        const next = distance(point, cellToPixels(cell, grid));
        if (next >= bestDistance || !accept(cell)) continue;
        best = cell;
        bestDistance = next;
    }
    return best;
}

/** Euclidean nearest free cell to a pixel point; ties resolve in reading order. */
export function nearestFreeCell(
    point: Point,
    span: Span,
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[],
    accept?: (cell: CellRect) => boolean,
): CellRect | null {
    return nearestCell(
        point,
        grid,
        span,
        (cell) =>
            isFree(cell, grid, occupied, obstacles) &&
            (!accept || accept(cell)),
    );
}

export type Direction = "left" | "right" | "up" | "down";

/**
 * Origins in a directional half-plane. In-line cells come first, then the
 * nearest diagonal cells, so a side band's last row can reach the shelf and
 * the shelf can return to the sides without a pointer.
 */
export function cellsInDirection(
    from: CellRect,
    direction: Direction,
    grid: CellGrid,
): CellRect[] {
    const origin = cellToPixels(from, grid);
    const half = pitch(grid) / 2;
    const horizontal = direction === "left" || direction === "right";
    const sign = direction === "right" || direction === "down" ? 1 : -1;
    return allCells(grid, { cols: from.cols, rows: from.rows })
        .map((cell) => {
            const pixels = cellToPixels(cell, grid);
            const main = horizontal
                ? (pixels.x - origin.x) * sign
                : (pixels.y - origin.y) * sign;
            const cross = horizontal
                ? Math.abs(pixels.y - origin.y)
                : Math.abs(pixels.x - origin.x);
            return { cell, pixels, main, inLine: cross < half };
        })
        .filter(({ main }) => main > 0.5)
        .sort((a, b) =>
            Number(b.inLine) - Number(a.inLine) ||
            distance(a.pixels, origin) - distance(b.pixels, origin)
        )
        .map(({ cell }) => cell);
}

/** One home note as the server stores it: an optional cell plus a size tier. */
export interface HomeNoteCell {
    id: string;
    size: DocumentNoteSize;
    band: Band | null;
    col: number | null;
    row: number | null;
}

/**
 * A rendered free cell may still intersect a saved footprint that folded to
 * another row at this viewport, especially a W currently rendered as S.
 * User moves must obey both footprints; automatic viewport reflow must not.
 */
export function canSaveHomeNoteCell(
    note: HomeNoteCell,
    cell: Cell,
    saved: readonly HomeNoteCell[],
    swapId?: string,
): boolean {
    const candidate = { ...cell, size: note.size };
    return saved.every((other) =>
        other.id === note.id || other.id === swapId ||
        other.band === null || other.col === null || other.row === null ||
        !homeNoteCellsOverlap(candidate, {
            band: other.band,
            col: other.col,
            row: other.row,
            size: other.size,
        })
    );
}

/** A placed note carries its rendered span; a W may render as S. */
export interface PlacedHomeNote<T extends HomeNoteCell> extends CellRect {
    note: T;
}

export interface PlaceHomeNotesOptions {
    obstacles?: readonly PixelRect[];
}

function spansFor(size: DocumentNoteSize): readonly Span[] {
    return size === "w"
        ? [HOME_NOTE_SPANS.w, HOME_NOTE_SPANS.s]
        : [HOME_NOTE_SPANS.s];
}

/**
 * Resolves one note near a pixel point: the nearest free cell, keeping W when
 * any W fits and otherwise rendering it as S. The stored tier is untouched.
 */
export function resolveHomeNoteCell(
    note: Pick<HomeNoteCell, "size">,
    point: Point,
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[] = [],
    accept?: (cell: CellRect) => boolean,
): CellRect | null {
    for (const span of spansFor(note.size)) {
        const cell = nearestFreeCell(
            point,
            span,
            grid,
            occupied,
            obstacles,
            accept,
        );
        if (cell) return cell;
    }
    return null;
}

/**
 * The pixel point a saved cell asks for at this viewport: out-of-range offsets
 * and rows clamp into the band. Null when the band has no cells here.
 */
function savedPoint(note: HomeNoteCell, grid: CellGrid): Point | null {
    if (note.band === null || note.col === null || note.row === null) {
        return null;
    }
    const band = bandOf(grid, note.band);
    if (!band) return null;
    const cols = Math.min(HOME_NOTE_SPANS[note.size].cols, band.columns.length);
    const col = Math.min(
        Math.max(Math.trunc(note.col), 0),
        band.columns.length - cols,
    );
    const row = Math.min(
        Math.max(Math.trunc(note.row), band.minRow),
        band.maxRow - 1,
    );
    return cellToPixels({ band: note.band, col, row, cols, rows: 1 }, grid);
}

/** Rows from the search line down, then above it; the shelf top-down. */
function defaultRowOrder(band: BandGrid, span: Span): number[] {
    const below: number[] = [];
    const above: number[] = [];
    for (let row = band.minRow; row + span.rows <= band.maxRow; row++) {
        (row >= 0 ? below : above).push(row);
    }
    return [...below, ...above.reverse()];
}

/** First free span inside one band, rows in default order, columns inner-first. */
function firstFreeInBand(
    span: Span,
    band: BandGrid,
    grid: CellGrid,
    occupied: readonly CellRect[],
    obstacles: readonly PixelRect[],
): CellRect | null {
    for (const row of defaultRowOrder(band, span)) {
        for (let col = 0; col + span.cols <= band.columns.length; col++) {
            const candidate = { band: band.band, col, row, ...span };
            if (isFree(candidate, grid, occupied, obstacles)) return candidate;
        }
    }
    return null;
}

/**
 * Places home notes in `homeSortOrder`. Saved cells are honoured first (the
 * nearest free cell when taken or out of range); notes without a usable cell
 * then alternate between the sides, filling each from the block outward and
 * from the search line down, and use the shelf when both sides are full.
 * Notes that do not fit are returned as overflow instead of being squeezed.
 */
export function placeHomeNotes<T extends HomeNoteCell>(
    notes: readonly T[],
    grid: CellGrid,
    options: PlaceHomeNotesOptions = {},
): { placed: PlacedHomeNote<T>[]; overflow: T[] } {
    const obstacles = options.obstacles ?? [];
    const occupied: CellRect[] = [];
    const chosen = new Map<T, CellRect>();
    const pending: T[] = [];
    for (const note of notes) {
        const point = savedPoint(note, grid);
        if (!point) {
            pending.push(note);
            continue;
        }
        // A saved side is an explicit choice: keep it even if a W must render
        // as S there. A wider shelf must not steal that note's saved position
        // or the cells belonging to a later saved shelf note.
        const cell = resolveHomeNoteCell(
            note,
            point,
            grid,
            occupied,
            obstacles,
            (candidate) => candidate.band === note.band,
        ) ?? resolveHomeNoteCell(note, point, grid, occupied, obstacles);
        if (!cell) continue;
        chosen.set(note, cell);
        occupied.push(cell);
    }
    let preferred: Band = "left";
    for (const note of pending) {
        const order: Band[] = [
            preferred,
            preferred === "left" ? "right" : "left",
            "center",
        ];
        let cell: CellRect | null = null;
        for (const span of spansFor(note.size)) {
            for (const name of order) {
                const band = bandOf(grid, name);
                if (!band) continue;
                cell = firstFreeInBand(span, band, grid, occupied, obstacles);
                if (cell) break;
            }
            if (cell) break;
        }
        preferred = preferred === "left" ? "right" : "left";
        if (!cell) continue;
        chosen.set(note, cell);
        occupied.push(cell);
    }
    const placed: PlacedHomeNote<T>[] = [];
    const overflow: T[] = [];
    for (const note of notes) {
        const cell = chosen.get(note);
        if (cell) placed.push({ note, ...cell });
        else overflow.push(note);
    }
    return { placed, overflow };
}
