/**
 * Desktop Window Manager Layout Hook
 * Issue #90: Device-local layout persistence, user isolation,
 * Zen/Widgets lifecycle transitions, and stale note cleanup.
 */

import {
    type Dispatch,
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
} from "react";
import {
    type DesktopAction,
    desktopReducer,
    type DesktopState,
    initialDesktopState,
    normalizeZOrders,
} from "./desktop-state.ts";
import type { DesktopGeometry } from "./desktop-geometry.ts";
import {
    loadDesktopLayout,
    type PersistedDesktopLayout,
    saveDesktopLayout,
} from "./desktop-persistence.ts";

export interface UseDesktopLayoutOptions {
    userId?: string | null;
    layoutStyle?: "widgets" | "zen";
    rect: DesktopGeometry;
    notes?: Array<{ id: string }> | null;
    notesLoaded?: boolean;
}

export type UseDesktopLayoutReturn = [DesktopState, Dispatch<DesktopAction>];

function hasStableGeometry(geometry: DesktopGeometry): boolean {
    return geometry.usable &&
        Number.isFinite(geometry.viewportRect.width) &&
        geometry.viewportRect.width > 0 &&
        Number.isFinite(geometry.viewportRect.height) &&
        geometry.viewportRect.height > 0 &&
        Number.isFinite(geometry.workRect.width) &&
        geometry.workRect.width > 0 &&
        Number.isFinite(geometry.workRect.height) &&
        geometry.workRect.height > 0 &&
        Number.isFinite(geometry.safeRect.width) &&
        geometry.safeRect.width > 0 &&
        Number.isFinite(geometry.safeRect.height) &&
        geometry.safeRect.height > 0;
}

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
    const currentActiveKeyRef = useRef(currentActiveKey);
    currentActiveKeyRef.current = currentActiveKey;
    const writeEnabledKeyRef = useRef<string | null>(null);
    const rectRef = useRef(rect);
    rectRef.current = rect;
    const dispatchAction = useCallback<Dispatch<DesktopAction>>((action) => {
        const geometry = "rect" in action ? action.rect : rectRef.current;
        if (
            action.type !== "HYDRATE" && action.type !== "RESET" &&
            action.type !== "CLAMP" && action.type !== "NORMALIZE" &&
            action.type !== "PRUNE_STALE_NOTES" &&
            hasStableGeometry(geometry)
        ) {
            writeEnabledKeyRef.current = currentActiveKeyRef.current;
        }
        dispatch(action);
    }, []);

    // Refs for lifecycle tracking and racing avoidance
    const stateRef = useRef(state);
    stateRef.current = state;

    const userIdRef = useRef(userId);
    userIdRef.current = userId;

    const layoutStyleRef = useRef(layoutStyle);
    layoutStyleRef.current = layoutStyle;

    const sessionMemoryRef = useRef(
        new Map<string, PersistedDesktopLayout>(),
    );
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

    // Runtime ownership must not wait for network data or IndexedDB.
    useEffect(() => {
        const previousUser = lastSavedUserIdRef.current;
        if (
            previousUser && restoredKeyRef.current === previousUser &&
            writeEnabledKeyRef.current === previousUser &&
            hasStableGeometry(rectRef.current)
        ) {
            void saveDesktopLayout(
                previousUser,
                stateRef.current,
                rectRef.current,
                sessionMemoryRef.current,
            );
        }
        writeEnabledKeyRef.current = null;
        dispatch({ type: "RESET" });
        stateRef.current = initialDesktopState;
        activeRestoredKeyRef.current = currentActiveKey;
        lastSavedUserIdRef.current = currentActiveKey;
        restoredKeyRef.current = null;
    }, [currentActiveKey]);

    // Restore only after usable viewport and safe bounds have been measured.
    useEffect(() => {
        if (
            !currentActiveKey || !hasStableGeometry(rect) ||
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
                writeEnabledKeyRef.current = targetUserId;
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

    // Persist only after a successful restore or a stable user-initiated layout action.
    useEffect(() => {
        if (
            !currentActiveKey ||
            writeEnabledKeyRef.current !== currentActiveKey ||
            restoredKeyRef.current !== currentActiveKey ||
            !hasStableGeometry(rect)
        ) {
            return;
        }

        void saveDesktopLayout(
            currentActiveKey,
            stateRef.current,
            rectRef.current,
            sessionMemoryRef.current,
        );
    }, [state, currentActiveKey, rect]);

    // 4. Lifecycle flush on pagehide, visibilitychange (e.g. reload or tab background) and unmount
    useEffect(() => {
        const flushOnExit = () => {
            if (
                userIdRef.current &&
                layoutStyleRef.current === "widgets" &&
                restoredKeyRef.current === userIdRef.current &&
                writeEnabledKeyRef.current === userIdRef.current &&
                hasStableGeometry(rectRef.current)
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

    return [displayedState, dispatchAction];
}
