/**
 * Desktop Window Manager Layout Hook
 * Issue #90: Device-local layout persistence, user isolation,
 * Zen/Widgets lifecycle transitions, and stale note cleanup.
 */

import { type Dispatch, useEffect, useMemo, useReducer, useRef } from "react";
import {
    type DesktopAction,
    desktopReducer,
    type DesktopState,
    initialDesktopState,
    normalizeZOrders,
} from "./desktop-state.ts";
import type { SafeRect } from "./desktop-geometry.ts";
import {
    loadDesktopLayout,
    type PersistedDesktopLayout,
    saveDesktopLayout,
} from "./desktop-persistence.ts";

export interface UseDesktopLayoutOptions {
    userId?: string | null;
    layoutStyle?: "widgets" | "zen";
    rect: SafeRect;
    notes?: Array<{ id: string }> | null;
    notesLoaded?: boolean;
}

export type UseDesktopLayoutReturn = [DesktopState, Dispatch<DesktopAction>];

export function useDesktopLayout(
    options: UseDesktopLayoutOptions,
): UseDesktopLayoutReturn {
    const {
        userId,
        layoutStyle = "widgets",
        rect,
        notes,
        notesLoaded = true,
    } = options;

    const currentUserId = userId ?? null;
    const currentActiveKey = (currentUserId && layoutStyle === "widgets")
        ? currentUserId
        : null;

    const [state, dispatch] = useReducer(desktopReducer, initialDesktopState);

    // Instance-level session fallback (no module-level mutable state)
    const sessionMemoryRef = useRef<Map<string, PersistedDesktopLayout>>(
        new Map(),
    );

    // Refs for lifecycle tracking and racing avoidance
    const stateRef = useRef(state);
    stateRef.current = state;

    const rectRef = useRef(rect);
    rectRef.current = rect;

    const userIdRef = useRef(userId);
    userIdRef.current = userId;

    const layoutStyleRef = useRef(layoutStyle);
    layoutStyleRef.current = layoutStyle;

    const restoreSeqRef = useRef(0);
    const activeRestoredKeyRef = useRef<string | null>(null);
    const restoredKeyRef = useRef<string | null>(null);
    const lastSavedUserIdRef = useRef<string | null>(null);

    // Compute set of valid note IDs for filtering
    const validNoteIds = useMemo(() => {
        if (!notes) return undefined;
        const set = new Set<string>();
        for (const note of notes) {
            set.add(note.id);
        }
        return set;
    }, [notes]);

    // Helper to immediately flush state persistence to storage
    const flushSave = (uid: string, s: DesktopState, r: SafeRect) => {
        return saveDesktopLayout(uid, s, r, sessionMemoryRef.current);
    };

    // Runtime ownership must not wait for network data or IndexedDB.
    useEffect(() => {
        const previousUser = lastSavedUserIdRef.current;
        if (previousUser && restoredKeyRef.current === previousUser) {
            void flushSave(previousUser, stateRef.current, rectRef.current);
        }
        dispatch({ type: "RESET" });
        stateRef.current = initialDesktopState;
        activeRestoredKeyRef.current = currentActiveKey;
        lastSavedUserIdRef.current = currentActiveKey;
        restoredKeyRef.current = null;
    }, [currentActiveKey]);

    // Restore only once note identities and the measured safe rect are available.
    useEffect(() => {
        if (
            !currentActiveKey || rect.width <= 0 || rect.height <= 0 ||
            !notesLoaded ||
            restoredKeyRef.current === currentActiveKey
        ) return;
        const seq = ++restoreSeqRef.current;
        const targetUserId = currentActiveKey;
        const targetRect = rect;

        void loadDesktopLayout(
            targetUserId,
            targetRect,
            validNoteIds,
            sessionMemoryRef.current,
        )
            .then((restored) => {
                if (
                    restoreSeqRef.current !== seq ||
                    userIdRef.current !== targetUserId ||
                    layoutStyleRef.current !== "widgets"
                ) {
                    return; // Superseded or mode changed
                }

                restoredKeyRef.current = targetUserId;
                if (!restored) {
                    dispatch({ type: "HYDRATE", state: stateRef.current });
                    return;
                }

                // Handle async restore race: merge with any windows opened by user during restore
                const currentWindows =
                    activeRestoredKeyRef.current === targetUserId
                        ? stateRef.current.windows
                        : [];

                if (currentWindows.length > 0) {
                    const currentIds = new Set(currentWindows.map((w) => w.id));
                    const nonCollidingRestored = restored.windows.filter(
                        (rw) => !currentIds.has(rw.id),
                    );

                    const mergedWindows = normalizeZOrders([
                        ...nonCollidingRestored,
                        ...currentWindows,
                    ]);

                    dispatch({
                        type: "HYDRATE",
                        state: {
                            windows: mergedWindows,
                            activeId: stateRef.current.activeId ??
                                restored.activeId,
                        },
                    });
                } else {
                    dispatch({
                        type: "HYDRATE",
                        state: restored,
                    });
                }
            })
            .catch(() => {
                // Read failure: proceeds with empty memory state
            });

        return () => {
            // Invalidate pending restore when inputs change or component unmounts
            ++restoreSeqRef.current;
        };
    }, [currentActiveKey, validNoteIds, rect, notesLoaded]);

    // 2. Stale Note IDs removal once notes are loaded during active runtime
    useEffect(() => {
        if (!notesLoaded || !validNoteIds || !activeRestoredKeyRef.current) {
            return;
        }
        if (state.windows.some((w) => w.kind === "note")) {
            dispatch({
                type: "PRUNE_STALE_NOTES",
                validNoteIds,
            });
        }
    }, [notesLoaded, validNoteIds, state.windows]);

    // 3. Immediate persistence per stable reducer commit
    useEffect(() => {
        if (!currentActiveKey || restoredKeyRef.current !== currentActiveKey) {
            return;
        }

        void saveDesktopLayout(
            currentActiveKey,
            stateRef.current,
            rectRef.current,
            sessionMemoryRef.current,
        );
    }, [state, currentActiveKey]);

    // 4. Lifecycle flush on pagehide, visibilitychange (e.g. reload or tab background) and unmount
    useEffect(() => {
        const flushOnExit = () => {
            if (
                userIdRef.current &&
                layoutStyleRef.current === "widgets" &&
                restoredKeyRef.current === userIdRef.current
            ) {
                void saveDesktopLayout(
                    userIdRef.current,
                    stateRef.current,
                    rectRef.current,
                    sessionMemoryRef.current,
                );
            }
        };

        if (typeof globalThis.addEventListener === "function") {
            globalThis.addEventListener("pagehide", flushOnExit);
            globalThis.addEventListener("visibilitychange", flushOnExit);
            globalThis.addEventListener("beforeunload", flushOnExit);
        }

        return () => {
            if (typeof globalThis.removeEventListener === "function") {
                globalThis.removeEventListener("pagehide", flushOnExit);
                globalThis.removeEventListener("visibilitychange", flushOnExit);
                globalThis.removeEventListener("beforeunload", flushOnExit);
            }
            flushOnExit();
        };
    }, []);

    // Immediate render user switch protection:
    // If state owner does not match currentUserId during render, return initial empty state.
    const isOwnerMatch = activeRestoredKeyRef.current === currentActiveKey;
    const displayedState = isOwnerMatch ? state : initialDesktopState;

    return [displayedState, dispatch];
}
