export interface DesktopFootprint {
    id: string;
    cols: 1 | 2;
    rows: 1 | 2;
}

export interface DesktopPlacement {
    id: string;
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
}

/** Canonical order is the only input order; positions are never persisted. */
export function calculateDesktopLayout(
    items: readonly DesktopFootprint[],
    columnCount: number,
): DesktopPlacement[] {
    const columns = Math.max(2, Math.floor(columnCount));
    const occupied: boolean[][] = [];
    const result: DesktopPlacement[] = [];
    for (const item of items) {
        let row = 0;
        let col = 0;
        search: for (;; row++) {
            candidate: for (col = 0; col <= columns - item.cols; col++) {
                for (let y = row; y < row + item.rows; y++) {
                    for (let x = col; x < col + item.cols; x++) {
                        if (occupied[y]?.[x]) continue candidate;
                    }
                }
                break search;
            }
        }
        for (let y = row; y < row + item.rows; y++) {
            occupied[y] ??= [];
            for (let x = col; x < col + item.cols; x++) occupied[y][x] = true;
        }
        result.push({
            id: item.id,
            col,
            row,
            colSpan: item.cols,
            rowSpan: item.rows,
        });
    }
    return result;
}
