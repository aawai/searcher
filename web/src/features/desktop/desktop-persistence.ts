/**
 * Desktop Window Manager Persistence Engine
 * Issue #90 / #102 M6: IndexedDB desktop payload v3, readable legacy v1/v2,
 * normalized frame geometry, strict validation fallbacks, and user isolation.
 */

import {
    clampFrame,
    type Frame,
    type SafeRect,
    snapFrame,
    type SnapMode,
    type WindowKind,
} from "./desktop-geometry.ts";
import {
    type DesktopState,
    type DesktopWindowState,
    getTopmostVisibleWindowId,
    normalizeZOrders,
    type WindowMode,
} from "./desktop-state.ts";
import { getLocal, setLocal } from "../../lib/local.ts";

export const DESKTOP_LAYOUT_SCHEMA_VERSION = 3 as const;

const VALID_SNAP_MODES: Record<string, true> = {
    "left": true,
    "right": true,
    "top-left": true,
    "top-right": true,
    "bottom-left": true,
    "bottom-right": true,
    "maximize": true,
};

export interface NormalizedFrame {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PersistedWindowLayout {
    id: string;
    kind: WindowKind;
    entityId: string | null;
    frame: NormalizedFrame;
    restoreFrame?: NormalizedFrame | null;
    mode: WindowMode;
    zOrder: number;
    snap: SnapMode | null;
}

export interface PersistedDesktopLayout {
    version: 1 | 2 | typeof DESKTOP_LAYOUT_SCHEMA_VERSION;
    windows: PersistedWindowLayout[];
    activeId: string | null;
}

export function desktopLayoutStorageKey(userId: string): string {
    return `searcher:desktop-layout:v1:${userId}`;
}

export function normalizeFrame(frame: Frame, rect: SafeRect): NormalizedFrame {
    const safeW = rect.width > 0 ? rect.width : 1;
    const safeH = rect.height > 0 ? rect.height : 1;
    return {
        x: Math.max(0, frame.x / safeW),
        y: Math.max(0, frame.y / safeH),
        width: Math.max(0, Math.min(1, frame.width / safeW)),
        height: Math.max(0, Math.min(1, frame.height / safeH)),
    };
}

export function denormalizeFrame(norm: NormalizedFrame, rect: SafeRect): Frame {
    const safeW = Math.max(0, rect.width);
    const safeH = Math.max(0, rect.height);
    return {
        x: Math.round(norm.x * safeW),
        y: Math.round(norm.y * safeH),
        width: Math.round(norm.width * safeW),
        height: Math.round(norm.height * safeH),
    };
}

/**
 * Encodes runtime DesktopState into PersistedDesktopLayout with normalized coordinates.
 */
export function encodeDesktopLayout(
    state: DesktopState,
    rect: SafeRect,
): PersistedDesktopLayout {
    const windows: PersistedWindowLayout[] = state.windows.map((win) => {
        // Normal frame is the unmaximized frame
        const normalFrame = win.restoreFrame ?? win.frame;
        const normalizedNormalFrame = normalizeFrame(normalFrame, rect);
        const normalizedRestoreFrame = win.restoreFrame
            ? normalizeFrame(win.restoreFrame, rect)
            : null;

        return {
            id: win.id,
            kind: win.kind,
            entityId: win.entityId,
            frame: normalizedNormalFrame,
            restoreFrame: normalizedRestoreFrame,
            mode: win.mode,
            zOrder: win.zOrder,
            snap: win.snap ?? null,
        };
    });

    return {
        version: DESKTOP_LAYOUT_SCHEMA_VERSION,
        windows,
        activeId: state.activeId,
    };
}

/**
 * Decodes and strictly validates unknown payload into DesktopState.
 * Any structural corruption, duplicate IDs, or illegal discriminants cause the
 * entire desktop to fall back to null (default initial state).
 * Only legitimate note rows that are no longer in validNoteIds are dropped as stale.
 */
export function decodeDesktopLayout(
    payload: unknown,
    rect: SafeRect,
    validNoteIds?: Set<string>,
): DesktopState | null {
    if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload)
    ) {
        return null;
    }

    const raw = payload as Record<string, unknown>;

    // Previous schemas remain readable without losing Apps/Notes or the Documents root.
    if (
        raw.version !== 1 && raw.version !== 2 &&
        raw.version !== DESKTOP_LAYOUT_SCHEMA_VERSION
    ) {
        return null;
    }

    if (!Array.isArray(raw.windows)) {
        return null;
    }

    if (
        raw.activeId !== null && typeof raw.activeId !== "string" &&
        raw.activeId !== undefined
    ) {
        return null;
    }

    const seenIds = new Set<string>();
    const validWindows: DesktopWindowState[] = [];

    for (const item of raw.windows) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null; // Corrupted payload defaults entire desktop
        }
        const w = item as Record<string, unknown>;

        if (typeof w.id !== "string" || w.id.length === 0) return null;
        if (typeof w.kind !== "string") return null;

        const kind = w.kind;
        let entityId: string | null = null;

        // Strict identity validation per kind
        if (kind === "apps") {
            if (w.id !== "apps") return null;
            if (w.entityId !== null && w.entityId !== undefined) return null;
        } else if (kind === "notes") {
            if (w.id !== "notes") return null;
            if (w.entityId !== null && w.entityId !== undefined) return null;
        } else if (kind === "documents") {
            if (raw.version === 1 || w.id !== "documents") return null;
            if (w.entityId !== null && w.entityId !== undefined) return null;
        } else if (kind === "note" || kind === "document") {
            if (kind === "document" && raw.version !== 3) return null;
            if (typeof w.entityId !== "string" || w.entityId.length === 0) {
                return null;
            }
            entityId = w.entityId;
            if (w.id !== `${kind}:${entityId}`) return null;
        } else {
            return null; // Unknown kind corrupts payload
        }

        // Duplicate window IDs are forbidden
        if (seenIds.has(w.id)) {
            return null;
        }
        seenIds.add(w.id);

        // Strict mode validation
        if (
            w.mode !== "normal" &&
            w.mode !== "minimized" &&
            w.mode !== "maximized" &&
            w.mode !== "snapped"
        ) {
            return null;
        }
        const mode = w.mode as WindowMode;

        // Strict zOrder validation
        if (typeof w.zOrder !== "number" || !Number.isFinite(w.zOrder)) {
            return null;
        }
        const zOrder = w.zOrder;

        // Strict snap validation (nullable / string)
        if (w.snap !== null && w.snap !== undefined) {
            if (
                typeof w.snap !== "string" ||
                !Object.hasOwn(VALID_SNAP_MODES, w.snap)
            ) {
                return null;
            }
        }

        if (mode === "snapped") {
            if (
                !w.snap || typeof w.snap !== "string" ||
                !Object.hasOwn(VALID_SNAP_MODES, w.snap)
            ) {
                return null;
            }
        } else if (mode === "normal") {
            if (w.snap !== null && w.snap !== undefined) {
                return null;
            }
        } else if (mode === "maximized") {
            if (
                w.snap !== null && w.snap !== undefined && w.snap !== "maximize"
            ) {
                return null;
            }
        }
        // Strict frame validation: all coordinates must be finite numbers in [0..1]
        const rawFrame = w.frame as Record<string, unknown> | undefined;
        if (
            !rawFrame || typeof rawFrame !== "object" || Array.isArray(rawFrame)
        ) {
            return null;
        }
        if (
            typeof rawFrame.x !== "number" || !Number.isFinite(rawFrame.x) ||
            rawFrame.x < 0 || rawFrame.x > 1 ||
            typeof rawFrame.y !== "number" || !Number.isFinite(rawFrame.y) ||
            rawFrame.y < 0 || rawFrame.y > 1 ||
            typeof rawFrame.width !== "number" ||
            !Number.isFinite(rawFrame.width) || rawFrame.width <= 0 ||
            rawFrame.width > 1 ||
            typeof rawFrame.height !== "number" ||
            !Number.isFinite(rawFrame.height) || rawFrame.height <= 0 ||
            rawFrame.height > 1
        ) {
            return null;
        }
        // Strict restoreFrame validation if present
        const rawRestoreFrame = w.restoreFrame as
            | Record<string, unknown>
            | undefined
            | null;
        if (rawRestoreFrame !== null && rawRestoreFrame !== undefined) {
            if (
                typeof rawRestoreFrame !== "object" ||
                Array.isArray(rawRestoreFrame)
            ) {
                return null;
            }
            if (
                typeof rawRestoreFrame.x !== "number" ||
                !Number.isFinite(rawRestoreFrame.x) || rawRestoreFrame.x < 0 ||
                rawRestoreFrame.x > 1 ||
                typeof rawRestoreFrame.y !== "number" ||
                !Number.isFinite(rawRestoreFrame.y) || rawRestoreFrame.y < 0 ||
                rawRestoreFrame.y > 1 ||
                typeof rawRestoreFrame.width !== "number" ||
                !Number.isFinite(rawRestoreFrame.width) ||
                rawRestoreFrame.width <= 0 || rawRestoreFrame.width > 1 ||
                typeof rawRestoreFrame.height !== "number" ||
                !Number.isFinite(rawRestoreFrame.height) ||
                rawRestoreFrame.height <= 0 || rawRestoreFrame.height > 1
            ) {
                return null;
            }
        }
        // Stale note cleanup: only legitimate note rows missing from validNoteIds are dropped
        if (kind === "note" && validNoteIds && entityId !== null) {
            if (!validNoteIds.has(entityId)) {
                continue;
            }
        }

        // Denormalize normal frame to pixel values
        const denormalized = denormalizeFrame(
            {
                x: rawFrame.x,
                y: rawFrame.y,
                width: rawFrame.width,
                height: rawFrame.height,
            },
            rect,
        );

        // Clamp normal frame inside safeRect
        const clampedNormal = clampFrame(
            denormalized,
            rect,
            kind as WindowKind,
        );

        let finalFrame: Frame;
        let finalRestoreFrame: Frame | null;
        let finalSnap: SnapMode | null = null;

        if (mode === "maximized") {
            finalFrame = snapFrame("maximize", rect);
            finalRestoreFrame = clampedNormal;
            finalSnap = "maximize";
        } else if (mode === "snapped") {
            finalFrame = snapFrame(w.snap as SnapMode, rect);
            finalRestoreFrame = clampedNormal;
            finalSnap = w.snap as SnapMode;
        } else if (mode === "minimized") {
            if (w.snap === "maximize" || (w.snap == null && rawRestoreFrame)) {
                finalFrame = snapFrame("maximize", rect);
                finalRestoreFrame = clampedNormal;
                finalSnap = "maximize";
            } else if (w.snap) {
                finalFrame = snapFrame(w.snap as SnapMode, rect);
                finalRestoreFrame = clampedNormal;
                finalSnap = w.snap as SnapMode;
            } else {
                finalFrame = clampedNormal;
                finalRestoreFrame = null;
                finalSnap = null;
            }
        } else {
            finalFrame = clampedNormal;
            finalRestoreFrame = null;
            finalSnap = null;
        }

        validWindows.push({
            id: w.id,
            kind: kind as WindowKind,
            entityId,
            frame: finalFrame,
            restoreFrame: finalRestoreFrame,
            mode,
            zOrder,
            snap: finalSnap,
        });
    }

    const normalizedWindows = normalizeZOrders(validWindows);

    let activeId: string | null = null;
    const rawActiveId = typeof raw.activeId === "string" ? raw.activeId : null;
    if (
        rawActiveId &&
        normalizedWindows.some((w) =>
            w.id === rawActiveId && w.mode !== "minimized"
        )
    ) {
        activeId = rawActiveId;
    } else {
        activeId = getTopmostVisibleWindowId(normalizedWindows);
    }

    return {
        windows: normalizedWindows,
        activeId,
    };
}

/**
 * Loads desktop layout from IndexedDB (or provided session memory fallback).
 * Falls back safely to session fallback if IndexedDB throws or is unavailable.
 */
export async function loadDesktopLayout(
    userId: string,
    rect: SafeRect,
    validNoteIds?: Set<string>,
    sessionFallback?: Map<string, PersistedDesktopLayout>,
): Promise<DesktopState | null> {
    const key = desktopLayoutStorageKey(userId);
    let payload: unknown;

    try {
        payload = await getLocal<unknown>(key);
    } catch {
        payload = sessionFallback?.get(key);
    }

    if (payload === undefined && sessionFallback) {
        payload = sessionFallback.get(key);
    }

    if (!payload) return null;

    return decodeDesktopLayout(payload, rect, validNoteIds);
}

/**
 * Saves desktop layout to IndexedDB (and provided session memory fallback).
 * Write failure does not throw or trigger runtime rollback.
 */
export async function saveDesktopLayout(
    userId: string,
    state: DesktopState,
    rect: SafeRect,
    sessionFallback?: Map<string, PersistedDesktopLayout>,
): Promise<void> {
    const key = desktopLayoutStorageKey(userId);
    const payload = encodeDesktopLayout(state, rect);

    // Keep instance session memory up-to-date
    sessionFallback?.set(key, payload);

    try {
        await setLocal(key, payload);
    } catch {
        // Write failure: ignore per spec, do not rollback runtime state
    }
}
