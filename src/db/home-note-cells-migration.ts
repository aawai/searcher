import type { DatabaseSync } from "node:sqlite";
import { type DocumentNoteSize, HOME_NOTE_SPANS } from "../shared/documents.ts";
import type { DatabaseStore } from "./database.ts";

/**
 * Reference home for the one-time pixel-to-cell conversion (#285 Y3-D): the
 * 1440×900 home viewport with the 640px search box / app plate. The lattice is
 * frozen here because a migration must not follow later layout changes.
 */
export const HOME_NOTE_REFERENCE = {
    viewportWidth: 1440,
    viewportHeight: 900,
    inset: 32,
    blockLeft: 400,
    blockWidth: 640,
    blockTop: 314,
    blockBottom: 794,
    cell: 180,
    gap: 12,
    clearance: 48,
} as const;

export interface ReferenceColumn {
    x: number;
    band: "left" | "right";
}

interface CellRect {
    col: number;
    row: number;
    cols: number;
    rows: number;
}

function referenceColumns(): ReferenceColumn[] {
    const { blockLeft, blockWidth, cell, gap, inset, viewportWidth } =
        HOME_NOTE_REFERENCE;
    const step = cell + gap;
    const left: ReferenceColumn[] = [];
    for (let x = blockLeft - gap - cell; x >= inset - 0.5; x -= step) {
        left.unshift({ x, band: "left" });
    }
    const right: ReferenceColumn[] = [];
    for (
        let x = blockLeft + blockWidth + gap;
        x + cell <= viewportWidth - inset + 0.5;
        x += step
    ) {
        right.push({ x, band: "right" });
    }
    return [...left, ...right];
}

function referenceRows(): number {
    const { viewportHeight, clearance, blockTop, blockBottom, gap } =
        HOME_NOTE_REFERENCE;
    const step = HOME_NOTE_REFERENCE.cell + gap;
    const clearanceRows = Math.floor(
        (viewportHeight - clearance - blockTop + gap) / step,
    );
    const bottomRows = Math.floor((blockBottom - blockTop + gap) / step);
    return Math.max(0, Math.min(clearanceRows, bottomRows));
}

export const HOME_NOTE_REFERENCE_GRID = {
    columns: referenceColumns(),
    rows: referenceRows(),
    cell: HOME_NOTE_REFERENCE.cell,
    gap: HOME_NOTE_REFERENCE.gap,
    top: HOME_NOTE_REFERENCE.blockTop,
} as const;

function nearestColumn(x: number): number {
    let best = 0;
    let distance = Infinity;
    HOME_NOTE_REFERENCE_GRID.columns.forEach((column, index) => {
        const next = Math.abs(x - (column.x + HOME_NOTE_REFERENCE.cell / 2));
        if (next < distance) {
            distance = next;
            best = index;
        }
    });
    return best;
}

function desiredCell(x: number, y: number): { col: number; row: number } {
    const step = HOME_NOTE_REFERENCE.cell + HOME_NOTE_REFERENCE.gap;
    const row = Math.round((y - HOME_NOTE_REFERENCE.blockTop) / step);
    return {
        col: nearestColumn(x),
        row: Math.min(
            Math.max(row, 0),
            Math.max(0, HOME_NOTE_REFERENCE_GRID.rows - 1),
        ),
    };
}

function fits(rect: CellRect): boolean {
    const { columns, rows } = HOME_NOTE_REFERENCE_GRID;
    if (rect.col < 0 || rect.row < 0) return false;
    if (rect.col + rect.cols > columns.length) return false;
    if (rect.row + rect.rows > rows) return false;
    const band = columns[rect.col].band;
    for (let col = rect.col + 1; col < rect.col + rect.cols; col++) {
        if (columns[col].band !== band) return false;
    }
    return true;
}

function overlaps(a: CellRect, b: CellRect): boolean {
    return a.col < b.col + b.cols && a.col + a.cols > b.col &&
        a.row < b.row + b.rows && a.row + a.rows > b.row;
}

/** Nearest free cell by cell distance; ties resolve in reading order. */
function nearestFree(
    target: { col: number; row: number },
    size: DocumentNoteSize,
    placed: readonly CellRect[],
): CellRect | null {
    const span = HOME_NOTE_SPANS[size];
    let best: CellRect | null = null;
    let bestDistance = Infinity;
    for (let row = 0; row + span.rows <= HOME_NOTE_REFERENCE_GRID.rows; row++) {
        for (
            let col = 0;
            col + span.cols <= HOME_NOTE_REFERENCE_GRID.columns.length;
            col++
        ) {
            const candidate: CellRect = {
                col,
                row,
                cols: span.cols,
                rows: span.rows,
            };
            if (!fits(candidate)) continue;
            if (placed.some((other) => overlaps(candidate, other))) continue;
            const distance = (col - target.col) ** 2 +
                (row - target.row) ** 2;
            if (distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
            }
        }
    }
    return best;
}

interface LegacyLayout {
    id: string;
    x: number;
    y: number;
    size: DocumentNoteSize;
}

function readLegacyLayouts(native: DatabaseSync): LegacyLayout[] {
    const rows = native.prepare(
        `SELECT l.id AS id, l.x AS x, l.y AS y, l.size AS size
         FROM document_layouts l
         JOIN documents d ON d.id = l.document_id
         WHERE l.device_class = 'desktop'
           AND l.col IS NULL AND l.row IS NULL
           AND l.x IS NOT NULL AND l.y IS NOT NULL
           AND d.is_home_fixed = 1 AND d.deleted_at IS NULL
         ORDER BY d.home_sort_order ASC, d.id DESC`,
    ).all();
    return rows.map((row) => {
        const { id, x, y, size } = row;
        if (
            typeof id !== "string" || typeof x !== "number" ||
            typeof y !== "number"
        ) {
            throw new TypeError("Unexpected document_layouts row");
        }
        return { id, x, y, size: size === "w" ? "w" : "s" } as const;
    });
}

/**
 * Converts saved pixel layouts to the frozen reference lattice and shifts
 * conflicts by `homeSortOrder`. The reference grid had one column per side;
 * each reference column becomes a band-relative `{ band, col: 0 }` cell.
 * Runs in one native transaction while holding the store's FIFO queue; any
 * failure rolls back every converted row. Idempotent: only rows with neither
 * col nor row are considered.
 */
export async function migrateHomeNoteCells(
    store: DatabaseStore,
): Promise<number> {
    return await store.nativeTransaction((native) => {
        const rows = readLegacyLayouts(native);
        if (rows.length === 0) return 0;
        const placed: CellRect[] = [];
        const update = native.prepare(
            "UPDATE document_layouts SET band = ?, col = ?, row = ?, size = ? WHERE id = ? AND col IS NULL AND row IS NULL",
        );
        for (const row of rows) {
            const target = desiredCell(row.x, row.y);
            let size = row.size;
            let cell = nearestFree(target, size, placed);
            if (!cell && size === "w") {
                size = "s";
                cell = nearestFree(target, size, placed);
            }
            if (!cell) {
                // Capacity is full: leave the note unplaced so the client's
                // default placement / 更多笔记 entry can handle it.
                continue;
            }
            const band = HOME_NOTE_REFERENCE_GRID.columns[cell.col].band;
            const offset = cell.col -
                HOME_NOTE_REFERENCE_GRID.columns.findIndex((column) =>
                    column.band === band
                );
            update.run(band, offset, cell.row, size, row.id);
            placed.push(cell);
        }
        return rows.length;
    });
}
