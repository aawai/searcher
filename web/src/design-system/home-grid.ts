/** CSS-pixel mirrors of tokens.css, protected by home-grid.test.ts. */
export const HOME_GRID = {
    wide: { cell: 84, gap: 12 },
    narrow: { cell: 64, gap: 6 },
    narrowCoarse: { cell: 68, gap: 4 },
    wideCoarse: { cell: 88, gap: 12 },
    axis: 0.5,
} as const;

export const HOME_GRID_VIEWPORT_INSET = "--home-grid-viewport-inset";
