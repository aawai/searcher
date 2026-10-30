/** Layout capacity boundaries registered in VISUAL_LANGUAGE.md. */
export const BREAKPOINTS = {
    small: 640,
    medium: 768,
    // Default 960px notes frame has a 958px host at 1440×900.
    notesSidebar: 958,
    wide: 1024,
} as const;

export function hasPersistentNotesSidebar(hostWidth: number): boolean {
    return hostWidth >= BREAKPOINTS.notesSidebar;
}

export const MEDIA_QUERIES = {
    belowSmall: `(max-width: ${BREAKPOINTS.small - 1}px)`,
    belowMedium: `(max-width: ${BREAKPOINTS.medium - 1}px)`,
    belowWide: `(max-width: ${BREAKPOINTS.wide - 1}px)`,
    coarsePointer: "(any-pointer: coarse)",
    editorCompact: `(any-pointer: coarse), (max-width: ${
        BREAKPOINTS.small - 1
    }px)`,
} as const;
