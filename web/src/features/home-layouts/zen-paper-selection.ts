import { type PaperItem, sortPapers } from "./home-papers.ts";

export interface ZenPaperSelectionState {
    userId: string;
    paperIds: string[];
    currentId?: string;
}

export function createZenPaperSelectionState(
    userId: string,
    papers: PaperItem[],
): ZenPaperSelectionState {
    const paperIds = sortPapers(papers).map((paper) => paper.id);
    return {
        userId,
        paperIds,
        currentId: paperIds[0],
    };
}

export function reconcileZenPaperSelection(
    state: ZenPaperSelectionState,
    papers: PaperItem[],
): ZenPaperSelectionState {
    const paperIds = sortPapers(papers).map((paper) => paper.id);
    if (
        paperIds.length === state.paperIds.length &&
        paperIds.every((id, index) => id === state.paperIds[index])
    ) return state;

    const available = new Set(paperIds);
    let currentId = state.currentId;
    if (!currentId || !available.has(currentId)) {
        currentId = undefined;
        const oldIndex = state.currentId
            ? state.paperIds.indexOf(state.currentId)
            : -1;
        for (let index = oldIndex + 1; index < state.paperIds.length; index++) {
            const candidate = state.paperIds[index];
            if (available.has(candidate)) {
                currentId = candidate;
                break;
            }
        }
        if (currentId === undefined) {
            for (let index = oldIndex - 1; index >= 0; index--) {
                const candidate = state.paperIds[index];
                if (available.has(candidate)) {
                    currentId = candidate;
                    break;
                }
            }
        }
        currentId ??= paperIds[0];
    }

    return { ...state, paperIds, currentId };
}

export function restoreZenPaperSelection(
    state: ZenPaperSelectionState,
    savedId: string | undefined,
): ZenPaperSelectionState {
    const currentId = savedId !== undefined && state.paperIds.includes(savedId)
        ? savedId
        : state.paperIds[0];
    return { ...state, currentId };
}

export function selectZenPaperIndex(
    state: ZenPaperSelectionState,
    index: number,
): ZenPaperSelectionState {
    if (
        !Number.isInteger(index) || index < 0 || index >= state.paperIds.length
    ) {
        return state;
    }
    return {
        ...state,
        currentId: state.paperIds[index],
    };
}

/** Device-local storage key; the historical value is kept so saved selections survive the rename. */
export function zenPaperSelectionKey(userId: string): string {
    return `zen:home-note-selection:${encodeURIComponent(userId)}`;
}
