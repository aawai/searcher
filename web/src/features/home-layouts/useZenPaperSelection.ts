import { useLayoutEffect, useMemo, useState } from "react";
import type { PaperItem } from "./home-papers.ts";
import { sortPapers } from "./home-papers.ts";
import type { ZenPaperSelectionState } from "./zen-paper-selection.ts";
import {
    createZenPaperSelectionState,
    reconcileZenPaperSelection,
    restoreZenPaperSelection,
    selectZenPaperIndex,
    zenPaperSelectionKey,
} from "./zen-paper-selection.ts";

function restore(userId: string, papers: PaperItem[]): ZenPaperSelectionState {
    const initial = createZenPaperSelectionState(userId, papers);
    if (!userId) return initial;
    try {
        return restoreZenPaperSelection(
            initial,
            localStorage.getItem(zenPaperSelectionKey(userId)) ?? undefined,
        );
    } catch {
        return initial;
    }
}

function persist(state: ZenPaperSelectionState): void {
    if (!state.userId) return;
    try {
        const key = zenPaperSelectionKey(state.userId);
        if (state.currentId === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, state.currentId);
    } catch {
        // Device view state is optional; denied storage must not block reading.
    }
}

export interface ZenPaperSelection {
    papers: PaperItem[];
    current: PaperItem | undefined;
    index: number;
    select: (index: number) => void;
}

export function useZenPaperSelection(
    userId: string,
    papers: PaperItem[],
): ZenPaperSelection {
    const visiblePapers = useMemo(
        () => userId ? sortPapers(papers) : [],
        [papers, userId],
    );
    const [selection, setSelection] = useState(() =>
        restore(userId, visiblePapers)
    );
    const stateForView = selection.userId === userId
        ? reconcileZenPaperSelection(selection, visiblePapers)
        : restore(userId, visiblePapers);

    useLayoutEffect(() => {
        if (selection !== stateForView) {
            setSelection(stateForView);
            persist(stateForView);
        } else if (stateForView.currentId === undefined) {
            persist(stateForView);
        }
    }, [selection, stateForView]);

    function select(index: number): void {
        const next = selectZenPaperIndex(stateForView, index);
        if (!userId || next === stateForView) return;
        // Commit this tiny scalar before publishing the view: an immediate reload
        // must not race a passive effect or an asynchronous storage transaction.
        persist(next);
        setSelection(next);
    }

    const index = stateForView.currentId === undefined
        ? -1
        : visiblePapers.findIndex((paper) =>
            paper.id === stateForView.currentId
        );
    return {
        papers: visiblePapers,
        current: index < 0 ? undefined : visiblePapers[index],
        index,
        select,
    };
}
