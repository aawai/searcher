/**
 * Desktop Window Manager State Engine
 * Issue #88: Window State, Z-order management, and Lifecycle Transitions.
 */

import {
    clampFrame,
    defaultFrame,
    type DesktopGeometry,
    type Frame,
    type FrameBasis,
    frameBasisForGeometry,
    snapFrame,
    type SnapMode,
    type WindowKind,
} from "./desktop-geometry.ts";

export type WindowMode = "normal" | "minimized" | "maximized" | "snapped";

export interface DesktopWindowState {
    id: string;
    kind: WindowKind;
    entityId: string | null;
    frame: Frame;
    frameBasis: FrameBasis;
    restoreFrame: Frame | null;
    restoreFrameBasis: FrameBasis | null;
    mode: WindowMode;
    zOrder: number;
    snap?: SnapMode | null;
}

export interface DesktopState {
    windows: DesktopWindowState[];
    activeId: string | null;
}

export const initialDesktopState: DesktopState = {
    windows: [],
    activeId: null,
};

export type DesktopAction =
    | {
        type: "OPEN";
        id: string;
        kind: WindowKind;
        entityId?: string | null;
        rect: DesktopGeometry;
    }
    | { type: "CLOSE"; id: string }
    | { type: "FOCUS"; id: string }
    | { type: "MINIMIZE"; id: string }
    | { type: "SNAP"; id: string; snap: SnapMode; rect: DesktopGeometry }
    | { type: "RESTORE"; id: string; rect: DesktopGeometry }
    | { type: "MAXIMIZE"; id: string; rect: DesktopGeometry }
    | { type: "RESTORE_FRAME"; id: string; rect: DesktopGeometry }
    | { type: "MOVE"; id: string; frame: Frame; rect: DesktopGeometry }
    | { type: "RESIZE"; id: string; frame: Frame; rect: DesktopGeometry }
    | { type: "NORMALIZE" }
    | { type: "HYDRATE"; state: DesktopState }
    | { type: "RESET" }
    | { type: "PRUNE_STALE_NOTES"; validNoteIds: Set<string> | string[] };

/**
 * Returns the ID of the topmost visible (non-minimized) window.
 */
export function getTopmostVisibleWindowId(
    windows: DesktopWindowState[],
    excludeId?: string,
): string | null {
    let topId: string | null = null;
    let topZ = -Infinity;

    for (const w of windows) {
        if (w.id === excludeId) continue;
        if (w.mode === "minimized") continue;
        if (w.zOrder > topZ) {
            topZ = w.zOrder;
            topId = w.id;
        }
    }

    return topId;
}

/**
 * Normalizes z-orders so they are bounded 1..N while strictly preserving relative stacking order.
 */
export function normalizeZOrders(
    windows: DesktopWindowState[],
): DesktopWindowState[] {
    if (windows.length <= 1) {
        return windows.map((w, i) => ({ ...w, zOrder: i + 1 }));
    }

    // Sort by current zOrder ascending
    const sorted = [...windows].sort((a, b) => a.zOrder - b.zOrder);
    const zMap: Record<string, number> = {};
    sorted.forEach((w, index) => {
        zMap[w.id] = index + 1;
    });

    return windows.map((w) => ({
        ...w,
        zOrder: zMap[w.id] ?? w.zOrder,
    }));
}

/**
 * Shared elevation helper: moves target window to top z-order (N) while keeping
 * all z-orders strictly bounded 1..N and preserving the relative stacking of other windows.
 */
function bringToTop(
    windows: DesktopWindowState[],
    targetId: string,
    updates?: Partial<DesktopWindowState>,
): DesktopWindowState[] {
    const target = windows.find((w) => w.id === targetId);
    if (!target) return windows;

    const others = windows
        .filter((w) => w.id !== targetId)
        .sort((a, b) => a.zOrder - b.zOrder);

    const zMap: Record<string, number> = {};
    others.forEach((w, index) => {
        zMap[w.id] = index + 1;
    });

    const elevatedTarget: DesktopWindowState = {
        ...target,
        ...updates,
        zOrder: windows.length,
    };

    return windows.map((w) => {
        if (w.id === targetId) {
            return elevatedTarget;
        }
        return {
            ...w,
            zOrder: zMap[w.id] ?? w.zOrder,
        };
    });
}

export function desktopReducer(
    state: DesktopState,
    action: DesktopAction,
): DesktopState {
    if (
        "rect" in action &&
        !action.rect.usable &&
        (action.type !== "OPEN" ||
            !state.windows.some((window) => window.id === action.id))
    ) return state;
    switch (action.type) {
        case "OPEN": {
            const existing = state.windows.find((w) => w.id === action.id);
            if (existing) {
                if (existing.mode === "minimized") {
                    const maximized = existing.snap === "maximize" ||
                        (existing.snap == null &&
                            existing.restoreFrame !== null);
                    return {
                        windows: bringToTop(state.windows, action.id, {
                            mode: maximized
                                ? "maximized"
                                : existing.snap
                                ? "snapped"
                                : "normal",
                            snap: maximized
                                ? "maximize"
                                : existing.snap ?? null,
                        }),
                        activeId: action.id,
                    };
                }

                return {
                    windows: bringToTop(state.windows, action.id),
                    activeId: action.id,
                };
            }

            if (
                !Number.isFinite(action.rect.safeRect.width) ||
                action.rect.safeRect.width <= 0 ||
                !Number.isFinite(action.rect.safeRect.height) ||
                action.rect.safeRect.height <= 0
            ) {
                return state;
            }

            // New window: cascade based on same-kind count
            const sameKindCount = state.windows.filter(
                (w) => w.kind === action.kind,
            ).length;

            const frame = defaultFrame(
                action.kind,
                action.rect,
                sameKindCount,
            );

            const normalizedExisting = normalizeZOrders(state.windows);
            const newWindow: DesktopWindowState = {
                id: action.id,
                kind: action.kind,
                entityId: action.entityId ?? null,
                frame,
                frameBasis: frameBasisForGeometry(action.rect),
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: state.windows.length + 1,
                snap: null,
            };

            return {
                windows: [...normalizedExisting, newWindow],
                activeId: action.id,
            };
        }

        case "CLOSE": {
            const nextWindows = state.windows.filter((w) => w.id !== action.id);
            if (nextWindows.length === state.windows.length) {
                return state;
            }

            const normalized = normalizeZOrders(nextWindows);
            let nextActiveId = state.activeId;
            if (state.activeId === action.id) {
                nextActiveId = getTopmostVisibleWindowId(normalized);
            }

            return {
                windows: normalized,
                activeId: nextActiveId,
            };
        }

        case "FOCUS": {
            const target = state.windows.find((w) => w.id === action.id);
            // Minimized windows are invisible on canvas and cannot be focused
            if (!target || target.mode === "minimized") return state;

            if (
                state.activeId === action.id &&
                target.zOrder === state.windows.length
            ) {
                return state;
            }

            return {
                windows: bringToTop(state.windows, action.id),
                activeId: action.id,
            };
        }

        case "MINIMIZE": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target || target.mode === "minimized") return state;

            const nextWindows = state.windows.map((w) =>
                w.id === action.id ? { ...w, mode: "minimized" as const } : w
            );

            let nextActiveId = state.activeId;
            if (state.activeId === action.id) {
                nextActiveId = getTopmostVisibleWindowId(nextWindows);
            }

            return {
                windows: nextWindows,
                activeId: nextActiveId,
            };
        }

        case "SNAP": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target) return state;

            const restoreFrame = target.restoreFrame ?? target.frame;
            const restoreFrameBasis = target.restoreFrame === null
                ? target.frameBasis
                : target.restoreFrameBasis;
            if (!restoreFrameBasis) return state;

            const mode: WindowMode = action.snap === "maximize"
                ? "maximized"
                : "snapped";
            return {
                windows: bringToTop(state.windows, action.id, {
                    mode,
                    snap: action.snap,
                    frame: snapFrame(action.snap, action.rect.workRect),
                    frameBasis: frameBasisForGeometry(action.rect),
                    restoreFrame,
                    restoreFrameBasis,
                }),
                activeId: action.id,
            };
        }

        case "MAXIMIZE": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target) return state;

            const restoreFrame = target.restoreFrame ?? target.frame;
            const restoreFrameBasis = target.restoreFrame === null
                ? target.frameBasis
                : target.restoreFrameBasis;
            if (!restoreFrameBasis) return state;

            return {
                windows: bringToTop(state.windows, action.id, {
                    mode: "maximized",
                    snap: "maximize",
                    frame: snapFrame("maximize", action.rect.workRect),
                    frameBasis: frameBasisForGeometry(action.rect),
                    restoreFrame,
                    restoreFrameBasis,
                }),
                activeId: action.id,
            };
        }

        case "RESTORE_FRAME": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target) return state;

            const finalFrame = clampFrame(
                target.restoreFrame ?? target.frame,
                action.rect,
                target.kind,
            );
            return {
                windows: bringToTop(state.windows, action.id, {
                    mode: "normal",
                    snap: null,
                    frame: finalFrame,
                    frameBasis: frameBasisForGeometry(action.rect),
                    restoreFrame: null,
                    restoreFrameBasis: null,
                }),
                activeId: action.id,
            };
        }

        case "RESTORE": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target) return state;

            if (target.mode === "minimized") {
                const maximized = target.snap === "maximize" ||
                    (target.snap == null && target.restoreFrame !== null);
                return {
                    windows: bringToTop(state.windows, action.id, {
                        mode: maximized
                            ? "maximized"
                            : target.snap
                            ? "snapped"
                            : "normal",
                        snap: maximized ? "maximize" : target.snap ?? null,
                    }),
                    activeId: action.id,
                };
            }

            if (target.mode !== "maximized" && target.mode !== "snapped") {
                return {
                    windows: bringToTop(state.windows, action.id),
                    activeId: action.id,
                };
            }

            const finalFrame = clampFrame(
                target.restoreFrame ?? target.frame,
                action.rect,
                target.kind,
            );
            return {
                windows: bringToTop(state.windows, action.id, {
                    mode: "normal",
                    snap: null,
                    frame: finalFrame,
                    frameBasis: frameBasisForGeometry(action.rect),
                    restoreFrame: null,
                    restoreFrameBasis: null,
                }),
                activeId: action.id,
            };
        }

        case "MOVE": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target) return state;

            const clamped = clampFrame(
                action.frame,
                action.rect,
                target.kind,
            );
            return {
                windows: bringToTop(state.windows, action.id, {
                    frame: clamped,
                    frameBasis: frameBasisForGeometry(action.rect),
                    mode: "normal",
                    snap: null,
                    restoreFrame: null,
                    restoreFrameBasis: null,
                }),
                activeId: action.id,
            };
        }

        case "RESIZE": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target) return state;

            const clamped = clampFrame(
                action.frame,
                action.rect,
                target.kind,
            );
            return {
                windows: bringToTop(state.windows, action.id, {
                    frame: clamped,
                    frameBasis: frameBasisForGeometry(action.rect),
                    mode: "normal",
                    snap: null,
                    restoreFrame: null,
                    restoreFrameBasis: null,
                }),
                activeId: action.id,
            };
        }

        case "NORMALIZE": {
            return {
                ...state,
                windows: normalizeZOrders(state.windows),
            };
        }

        case "HYDRATE": {
            const normalized = normalizeZOrders(action.state.windows);
            let activeId = action.state.activeId;
            if (
                activeId &&
                !normalized.some((w) =>
                    w.id === activeId && w.mode !== "minimized"
                )
            ) {
                activeId = getTopmostVisibleWindowId(normalized);
            }
            return {
                windows: normalized,
                activeId,
            };
        }

        case "RESET": {
            return initialDesktopState;
        }

        case "PRUNE_STALE_NOTES": {
            const validSet = action.validNoteIds instanceof Set
                ? action.validNoteIds
                : new Set(action.validNoteIds);
            const nextWindows = state.windows.filter((w) => {
                if (w.kind !== "note") return true;
                const noteId = w.entityId ??
                    (w.id.startsWith("note:") ? w.id.slice(5) : w.id);
                return validSet.has(noteId);
            });
            if (nextWindows.length === state.windows.length) {
                return state;
            }
            const normalized = normalizeZOrders(nextWindows);
            let nextActiveId = state.activeId;
            if (
                state.activeId &&
                !normalized.some((w) =>
                    w.id === state.activeId && w.mode !== "minimized"
                )
            ) {
                nextActiveId = getTopmostVisibleWindowId(normalized);
            }
            return {
                windows: normalized,
                activeId: nextActiveId,
            };
        }

        default:
            return state;
    }
}
