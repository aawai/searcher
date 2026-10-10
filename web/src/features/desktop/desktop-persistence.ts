/**
 * Desktop Window Manager Persistence Engine
 * Issue #90 / #102 M6: IndexedDB desktop payload v4, readable legacy v1-v3,
 * viewport-global normalized frames, strict validation, and user isolation.
 */

import {
    clampFrame,
    type DesktopGeometry,
    type Frame,
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

export const DESKTOP_LAYOUT_SCHEMA_VERSION = 4 as const;

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
    version: 1 | 2 | 3 | typeof DESKTOP_LAYOUT_SCHEMA_VERSION;
    windows: PersistedWindowLayout[];
    activeId: string | null;
}

export function desktopLayoutStorageKey(userId: string): string {
    return `searcher:desktop-layout:v1:${userId}`;
}

function hasPositiveFiniteDimensions(rect: {
    width: number;
    height: number;
}): boolean {
    return Number.isFinite(rect.width) && rect.width > 0 &&
        Number.isFinite(rect.height) && rect.height > 0;
}

function hasUsableGeometry(geometry: DesktopGeometry): boolean {
    return geometry.usable &&
        hasPositiveFiniteDimensions(geometry.viewportRect) &&
        hasPositiveFiniteDimensions(geometry.workRect);
}

function hasMeasuredSafeGeometry(geometry: DesktopGeometry): boolean {
    return hasUsableGeometry(geometry) &&
        hasPositiveFiniteDimensions(geometry.safeRect);
}

function isFiniteFrame(frame: unknown): frame is Frame {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
        return false;
    }
    const candidate = frame as Record<string, unknown>;
    return typeof candidate.x === "number" && Number.isFinite(candidate.x) &&
        typeof candidate.y === "number" && Number.isFinite(candidate.y) &&
        typeof candidate.width === "number" &&
        Number.isFinite(candidate.width) && candidate.width > 0 &&
        typeof candidate.height === "number" &&
        Number.isFinite(candidate.height) && candidate.height > 0;
}

function fitsViewport(frame: Frame, geometry: DesktopGeometry): boolean {
    const { width, height } = geometry.viewportRect;
    return frame.x >= 0 && frame.y >= 0 &&
        frame.x + frame.width <= width &&
        frame.y + frame.height <= height;
}

function isValidRuntimeLayout(
    state: DesktopState,
    geometry: DesktopGeometry,
): boolean {
    if (!Array.isArray(state.windows)) return false;
    const seenIds = new Set<string>();

    for (const window of state.windows) {
        if (
            !window || typeof window.id !== "string" ||
            window.id.length === 0 || seenIds.has(window.id) ||
            !isFiniteFrame(window.frame) || !fitsViewport(window.frame, geometry) ||
            (window.restoreFrame !== null &&
                (!isFiniteFrame(window.restoreFrame) ||
                    !fitsViewport(window.restoreFrame, geometry))) ||
            typeof window.zOrder !== "number" ||
            !Number.isFinite(window.zOrder)
        ) {
            return false;
        }
        seenIds.add(window.id);

        switch (window.kind) {
            case "apps":
                if (window.id !== "apps" || window.entityId !== null) {
                    return false;
                }
                break;
            case "notes":
                if (window.id !== "notes" || window.entityId !== null) {
                    return false;
                }
                break;
            case "documents":
                if (window.id !== "documents" || window.entityId !== null) {
                    return false;
                }
                break;
            case "note":
            case "document":
                if (
                    typeof window.entityId !== "string" ||
                    window.entityId.length === 0 ||
                    window.id !== `${window.kind}:${window.entityId}`
                ) {
                    return false;
                }
                break;
            default:
                return false;
        }

        const snap = window.snap ?? null;
        if (
            snap !== null &&
            (typeof snap !== "string" ||
                !Object.hasOwn(VALID_SNAP_MODES, snap))
        ) {
            return false;
        }
        if (
            (window.mode === "normal" &&
                (snap !== null || window.restoreFrame !== null)) ||
            (window.mode === "snapped" &&
                (!snap || snap === "maximize" ||
                    window.restoreFrame === null)) ||
            (window.mode === "maximized" &&
                (snap !== "maximize" || window.restoreFrame === null)) ||
            (window.mode === "minimized" &&
                ((snap === null && window.restoreFrame !== null) ||
                    (snap !== null && window.restoreFrame === null)))
        ) {
            return false;
        }
        if (
            window.mode !== "normal" && window.mode !== "minimized" &&
            window.mode !== "maximized" && window.mode !== "snapped"
        ) {
            return false;
        }
    }

    return true;
}

export function normalizeFrame(
    frame: Frame,
    geometry: DesktopGeometry,
): NormalizedFrame {
    const { width, height } = geometry.viewportRect;
    const viewportWidth = width > 0 && Number.isFinite(width) ? width : 1;
    const viewportHeight = height > 0 && Number.isFinite(height) ? height : 1;
    return {
        x: Math.max(0, frame.x / viewportWidth),
        y: Math.max(0, frame.y / viewportHeight),
        width: Math.max(0, Math.min(1, frame.width / viewportWidth)),
        height: Math.max(0, Math.min(1, frame.height / viewportHeight)),
    };
}

export function denormalizeFrame(
    norm: NormalizedFrame,
    geometry: DesktopGeometry,
): Frame {
    const { width, height } = geometry.viewportRect;
    return {
        x: Math.round(norm.x * Math.max(0, width)),
        y: Math.round(norm.y * Math.max(0, height)),
        width: Math.round(norm.width * Math.max(0, width)),
        height: Math.round(norm.height * Math.max(0, height)),
    };
}

function denormalizeLegacyFrame(
    norm: NormalizedFrame,
    geometry: DesktopGeometry,
): Frame {
    const { x, y, width, height } = geometry.safeRect;
    return {
        x: Math.round(norm.x * width) + x,
        y: Math.round(norm.y * height) + y,
        width: Math.round(norm.width * width),
        height: Math.round(norm.height * height),
    };
}

function isNormalizedFrame(value: unknown): value is NormalizedFrame {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const frame = value as Record<string, unknown>;
    return typeof frame.x === "number" && Number.isFinite(frame.x) &&
        frame.x >= 0 && frame.x <= 1 &&
        typeof frame.y === "number" && Number.isFinite(frame.y) &&
        frame.y >= 0 && frame.y <= 1 &&
        typeof frame.width === "number" && Number.isFinite(frame.width) &&
        frame.width > 0 && frame.width <= 1 &&
        typeof frame.height === "number" && Number.isFinite(frame.height) &&
        frame.height > 0 && frame.height <= 1;
}

/** Serializes a layout after the caller has validated its geometry and state. */
function serializeDesktopLayout(
    state: DesktopState,
    rect: DesktopGeometry,
): PersistedDesktopLayout {
    const windows: PersistedWindowLayout[] = state.windows.map((win) => {
        // Normal frame is the unmaximized frame.
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
 * Encodes runtime DesktopState into v4 normalized viewport coordinates.
 */
export function encodeDesktopLayout(
    state: DesktopState,
    rect: DesktopGeometry,
): PersistedDesktopLayout {
    if (!hasUsableGeometry(rect) || !isValidRuntimeLayout(state, rect)) {
        throw new TypeError("Cannot encode an invalid desktop layout");
    }
    return serializeDesktopLayout(state, rect);
}

/**
 * Decodes and strictly validates unknown payload into DesktopState.
 * Any structural corruption, duplicate IDs, or illegal discriminants cause the
 * entire desktop to fall back to null (default initial state).
 * Only legitimate note rows that are no longer in validNoteIds are dropped as stale.
 */
export function decodeDesktopLayout(
    payload: unknown,
    rect: DesktopGeometry,
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
    if (
        raw.version !== 1 && raw.version !== 2 && raw.version !== 3 &&
        raw.version !== DESKTOP_LAYOUT_SCHEMA_VERSION
    ) {
        return null;
    }

    if (
        raw.version === 4
            ? !hasUsableGeometry(rect)
            : !hasMeasuredSafeGeometry(rect)
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
            return null;
        }
        const w = item as Record<string, unknown>;

        if (typeof w.id !== "string" || w.id.length === 0) return null;
        if (typeof w.kind !== "string") return null;

        const kind = w.kind;
        let entityId: string | null = null;

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
            if (kind === "document" && raw.version < 3) return null;
            if (typeof w.entityId !== "string" || w.entityId.length === 0) {
                return null;
            }
            entityId = w.entityId;
            if (w.id !== `${kind}:${entityId}`) return null;
        } else {
            return null;
        }

        if (seenIds.has(w.id)) return null;
        seenIds.add(w.id);

        if (
            w.mode !== "normal" &&
            w.mode !== "minimized" &&
            w.mode !== "maximized" &&
            w.mode !== "snapped"
        ) {
            return null;
        }
        const mode = w.mode as WindowMode;

        if (typeof w.zOrder !== "number" || !Number.isFinite(w.zOrder)) {
            return null;
        }
        const zOrder = w.zOrder;

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
                !Object.hasOwn(VALID_SNAP_MODES, w.snap) ||
                w.snap === "maximize"
            ) {
                return null;
            }
        } else if (mode === "normal") {
            if (w.snap !== null && w.snap !== undefined) return null;
        } else if (mode === "maximized") {
            if (
                w.snap !== null && w.snap !== undefined && w.snap !== "maximize"
            ) {
                return null;
            }
        }

        const rawFrame = w.frame;
        if (!isNormalizedFrame(rawFrame)) return null;

        const rawRestoreFrame = w.restoreFrame;
        if (
            rawRestoreFrame !== null && rawRestoreFrame !== undefined &&
            !isNormalizedFrame(rawRestoreFrame)
        ) {
            return null;
        }

        if (
            raw.version === 4 &&
            (!Object.hasOwn(w, "snap") || w.snap === undefined ||
                !Object.hasOwn(w, "restoreFrame") ||
                rawRestoreFrame === undefined)
        ) {
            return null;
        }
        if (raw.version === 4) {
            const hasRestoreFrame = rawRestoreFrame !== null;
            const invalidModeSnap =
                (mode === "normal" &&
                    (w.snap !== null || hasRestoreFrame)) ||
                (mode === "snapped" &&
                    (w.snap === null || w.snap === "maximize" ||
                        !hasRestoreFrame)) ||
                (mode === "maximized" &&
                    (w.snap !== "maximize" || !hasRestoreFrame)) ||
                (mode === "minimized" &&
                    ((w.snap === null && hasRestoreFrame) ||
                        (w.snap !== null && !hasRestoreFrame)));
            if (invalidModeSnap) return null;
        }
        if (kind === "note" && validNoteIds && entityId !== null) {
            if (!validNoteIds.has(entityId)) continue;
        }

        const normalizedFrame: NormalizedFrame = {
            x: rawFrame.x,
            y: rawFrame.y,
            width: rawFrame.width,
            height: rawFrame.height,
        };
        const denormalized = raw.version === 4
            ? denormalizeFrame(normalizedFrame, rect)
            : denormalizeLegacyFrame(normalizedFrame, rect);
        const clampedNormal = clampFrame(
            denormalized,
            rect,
            kind as WindowKind,
        );

        let finalFrame: Frame;
        let finalRestoreFrame: Frame | null;
        let finalSnap: SnapMode | null = null;

        if (mode === "maximized") {
            finalFrame = snapFrame("maximize", rect.workRect);
            finalRestoreFrame = clampedNormal;
            finalSnap = "maximize";
        } else if (mode === "snapped") {
            finalFrame = snapFrame(w.snap as SnapMode, rect.workRect);
            finalRestoreFrame = clampedNormal;
            finalSnap = w.snap as SnapMode;
        } else if (mode === "minimized") {
            if (w.snap === "maximize" || (w.snap == null && rawRestoreFrame)) {
                finalFrame = snapFrame("maximize", rect.workRect);
                finalRestoreFrame = clampedNormal;
                finalSnap = "maximize";
            } else if (w.snap) {
                finalFrame = snapFrame(w.snap as SnapMode, rect.workRect);
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
    rect: DesktopGeometry,
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
    rect: DesktopGeometry,
    sessionFallback?: Map<string, PersistedDesktopLayout>,
): Promise<void> {
    if (
        !hasMeasuredSafeGeometry(rect) ||
        !isValidRuntimeLayout(state, rect)
    ) return;
    const key = desktopLayoutStorageKey(userId);
    const payload = serializeDesktopLayout(state, rect);
    // Keep instance session memory up-to-date
    sessionFallback?.set(key, payload);

    try {
        await setLocal(key, payload);
    } catch {
        // Write failure: ignore per spec, do not rollback runtime state
    }
}
