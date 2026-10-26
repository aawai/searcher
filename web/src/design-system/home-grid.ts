/** CSS-pixel mirrors of tokens.css, protected by home-grid.test.ts. */
export const HOME_GRID = {
    wide: { cell: 76, gap: 12 },
    narrow: { cell: 64, gap: 6 },
    narrowCoarse: { cell: 68, gap: 4 },
    wideCoarse: { cell: 80, gap: 8 },
    axis: 0.5,
} as const;

/** Home note lattice (S note = one cell), independent of the app grid. */
export const HOME_NOTE_GRID = {
    wide: { cell: 180, gap: 12 },
    narrow: { cell: 134, gap: 6 },
    narrowCoarse: { cell: 140, gap: 4 },
    wideCoarse: { cell: 188, gap: 12 },
} as const;

export const HOME_GRID_VIEWPORT_INSET = "--home-grid-viewport-inset";
