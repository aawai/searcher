/**
 * Desktop Window Manager State Engine
 * Issue #88: Window State, Z-order management, and Lifecycle Transitions.
 */

import {
    clampFrame,
    defaultFrame,
    type Frame,
    type SafeRect,
    type WindowKind,
} from "./desktop-geometry.ts";

export type WindowMode = "normal" | "minimized" | "maximized";

export interface DesktopWindowState {
    id: string;
    kind: WindowKind;
    entityId: string | null;
    frame: Frame;
    restoreFrame: Frame | null;
    mode: WindowMode;
    zOrder: number;
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
        rect: SafeRect;
    }
    | { type: "CLOSE"; id: string }
    | { type: "FOCUS"; id: string }
    | { type: "MINIMIZE"; id: string }
    | { type: "RESTORE"; id: string; rect: SafeRect }
    | { type: "MAXIMIZE"; id: string; rect: SafeRect }
    | { type: "RESTORE_FRAME"; id: string; rect: SafeRect }
    | { type: "MOVE"; id: string; frame: Frame; rect: SafeRect }
    | { type: "RESIZE"; id: string; frame: Frame; rect: SafeRect }
    | { type: "CLAMP"; rect: SafeRect }
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
    switch (action.type) {
        case "OPEN": {
            const existing = state.windows.find((w) => w.id === action.id);
            if (existing) {
                // If minimized, restore with respect to prior max state; else keep mode
                const nextMode: WindowMode = existing.mode === "minimized"
                    ? (existing.restoreFrame !== null ? "maximized" : "normal")
                    : existing.mode;

                const nextFrame = existing.mode === "minimized"
                    ? (existing.restoreFrame !== null
                        ? {
                            x: 0,
                            y: 0,
                            width: Math.max(0, action.rect.width),
                            height: Math.max(0, action.rect.height),
                        }
                        : clampFrame(
                            existing.frame,
                            action.rect,
                            existing.kind,
                        ))
                    : existing.frame;

                return {
                    windows: bringToTop(state.windows, action.id, {
                        mode: nextMode,
                        frame: nextFrame,
                    }),
                    activeId: action.id,
                };
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
                restoreFrame: null,
                mode: "normal",
                zOrder: state.windows.length + 1,
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

        case "MAXIMIZE": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target) return state;

            const restoreFrame = target.mode === "normal"
                ? target.frame
                : (target.restoreFrame ?? target.frame);

            const maximizedFrame: Frame = {
                x: 0,
                y: 0,
                width: Math.max(0, action.rect.width),
                height: Math.max(0, action.rect.height),
            };

            return {
                windows: bringToTop(state.windows, action.id, {
                    mode: "maximized",
                    frame: maximizedFrame,
                    restoreFrame,
                }),
                activeId: action.id,
            };
        }

        case "RESTORE_FRAME": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target) return state;

            const rawFrame = target.restoreFrame ?? target.frame;
            const finalFrame = clampFrame(rawFrame, action.rect, target.kind);

            return {
                windows: bringToTop(state.windows, action.id, {
                    mode: "normal",
                    frame: finalFrame,
                    restoreFrame: null,
                }),
                activeId: action.id,
            };
        }

        case "RESTORE": {
            const target = state.windows.find((w) => w.id === action.id);
            if (!target) return state;

            if (target.mode === "minimized") {
                // Minimized restored preserves prior max state:
                if (target.restoreFrame !== null) {
                    const finalFrame: Frame = {
                        x: 0,
                        y: 0,
                        width: Math.max(0, action.rect.width),
                        height: Math.max(0, action.rect.height),
                    };

                    return {
                        windows: bringToTop(state.windows, action.id, {
                            mode: "maximized",
                            frame: finalFrame,
                        }),
                        activeId: action.id,
                    };
                }

                const finalFrame = clampFrame(
                    target.frame,
                    action.rect,
                    target.kind,
                );
                return {
                    windows: bringToTop(state.windows, action.id, {
                        mode: "normal",
                        frame: finalFrame,
                    }),
                    activeId: action.id,
                };
            }

            if (target.mode === "maximized") {
                const rawFrame = target.restoreFrame ?? target.frame;
                const finalFrame = clampFrame(
                    rawFrame,
                    action.rect,
                    target.kind,
                );
                return {
                    windows: bringToTop(state.windows, action.id, {
                        mode: "normal",
                        frame: finalFrame,
                        restoreFrame: null,
                    }),
                    activeId: action.id,
                };
            }

            const finalFrame = clampFrame(
                target.frame,
                action.rect,
                target.kind,
            );
            return {
                windows: bringToTop(state.windows, action.id, {
                    frame: finalFrame,
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
                    mode: "normal",
                    restoreFrame: null,
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
                    mode: "normal",
                    restoreFrame: null,
                }),
                activeId: action.id,
            };
        }

        case "CLAMP": {
            const safeW = Math.max(0, action.rect.width);
            const safeH = Math.max(0, action.rect.height);

            const nextWindows = state.windows.map((w) => {
                if (w.mode === "maximized") {
                    const maximizedFrame: Frame = {
                        x: 0,
                        y: 0,
                        width: safeW,
                        height: safeH,
                    };
                    const clampedRestore = w.restoreFrame
                        ? clampFrame(w.restoreFrame, action.rect, w.kind)
                        : null;
                    return {
                        ...w,
                        frame: maximizedFrame,
                        restoreFrame: clampedRestore,
                    };
                }

                const clamped = clampFrame(w.frame, action.rect, w.kind);
                const clampedRestore = w.restoreFrame
                    ? clampFrame(w.restoreFrame, action.rect, w.kind)
                    : null;
                return {
                    ...w,
                    frame: clamped,
                    restoreFrame: clampedRestore,
                };
            });

            return {
                ...state,
                windows: nextWindows,
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
