import { useEffect, useMemo, useState } from "react";
import {
    deriveWallpaperAccent,
    type WallpaperAccent,
    type WallpaperPixels,
} from "../../design-system/wallpaper-accent.ts";
import { formatWallpaperCss } from "./WallpaperSurface.tsx";

/** Longest side of the downsampled image; enough for a hue histogram. */
const SAMPLE_SIZE = 64;
const ACCENT_CACHE_KEY = "searcher:wallpaper-accent-cache-v5";
const ACCENT_CACHE_MAX = 12;

export interface WallpaperSample {
    readonly pixels: WallpaperPixels;
}

function hashSourceKey(source: string): string {
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `${source.length}:${(hash >>> 0).toString(36)}`;
}

function readAccentCacheMap(): Record<string, WallpaperAccent> {
    try {
        const storage = globalThis.localStorage;
        if (!storage) return {};
        const raw = storage.getItem(ACCENT_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, WallpaperAccent>
            : {};
    } catch {
        return {};
    }
}

function isValidBandTone(band: unknown): boolean {
    if (!band || typeof band !== "object") return false;
    const record = band as Record<string, unknown>;
    return typeof record.lightness === "number" &&
        Number.isFinite(record.lightness) &&
        typeof record.spread === "number" && Number.isFinite(record.spread);
}

function readCachedWallpaperAccent(source: string): WallpaperAccent | null {
    if (!source) return null;
    const key = hashSourceKey(source);
    const hit = readAccentCacheMap()[key];
    if (
        !hit || typeof hit !== "object" ||
        typeof hit.darkTone?.lightness !== "number" ||
        typeof hit.darkTone?.ambientPrimary !== "string" ||
        !isValidBandTone(hit.mastheadBands?.left) ||
        !isValidBandTone(hit.mastheadBands?.right) ||
        !isValidBandTone(hit.topBand)
    ) {
        return null;
    }
    return hit;
}

function writeCachedWallpaperAccent(
    source: string,
    accent: WallpaperAccent,
): void {
    if (!source) return;
    try {
        const storage = globalThis.localStorage;
        if (!storage) return;
        const key = hashSourceKey(source);
        const existing = readAccentCacheMap();
        delete existing[key];
        existing[key] = accent;
        const keys = Object.keys(existing);
        if (keys.length > ACCENT_CACHE_MAX) {
            for (const stale of keys.slice(0, keys.length - ACCENT_CACHE_MAX)) {
                delete existing[stale];
            }
        }
        storage.setItem(ACCENT_CACHE_KEY, JSON.stringify(existing));
    } catch {
        // Ignore quota or disabled localStorage.
    }
}

function context2d(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    return context;
}

async function sampleImage(url: string): Promise<WallpaperPixels> {
    const image = new Image();
    // Remote images without CORS headers reject here instead of tainting the canvas.
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    const scale = SAMPLE_SIZE /
        Math.max(image.naturalWidth, image.naturalHeight, SAMPLE_SIZE);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = context2d(width, height);
    context.drawImage(image, 0, 0, width, height);
    return {
        width,
        height,
        data: context.getImageData(0, 0, width, height).data,
    };
}

/**
 * Pixels of a wallpaper source as the page renders it; null when there is no
 * wallpaper or the image cannot be read (decode failure, remote without CORS).
 */
export async function sampleWallpaper(
    source: string,
): Promise<WallpaperSample | null> {
    const css = formatWallpaperCss(source);
    if (css === "none") return null;
    try {
        return { pixels: await sampleImage(JSON.parse(css.slice(4, -1))) };
    } catch {
        return null;
    }
}

/**
 * Accent derived from the full wallpaper (decoupled from composition focal
 * point). Reads synchronously from a lightweight local summary cache so
 * page reloads do not flash an unsampled light frame, then verifies in
 * background when needed.
 */
export function useWallpaperAccent(
    source: string,
): WallpaperAccent | null {
    const cached = useMemo(
        () => (source ? readCachedWallpaperAccent(source) : null),
        [source],
    );
    const [resolved, setResolved] = useState<
        { source: string; accent: WallpaperAccent | null } | null
    >(null);
    useEffect(() => {
        if (!source) return;
        let alive = true;
        void sampleWallpaper(source).then((value) => {
            if (!alive) return;
            const derived = value ? deriveWallpaperAccent(value.pixels) : null;
            if (derived) writeCachedWallpaperAccent(source, derived);
            setResolved({ source, accent: derived });
        });
        return () => {
            alive = false;
        };
    }, [source]);
    if (!source) return null;
    if (resolved?.source === source) return resolved.accent;
    return cached;
}

/** Runtime custom properties `[data-accent="wallpaper"]` reads, per palette slot. */
const WALLPAPER_ACCENT_PROPERTIES = {
    accent: "--wallpaper-accent",
    hover: "--wallpaper-accent-hover",
    active: "--wallpaper-accent-active",
    foreground: "--wallpaper-accent-foreground",
    masthead: "--wallpaper-accent-masthead",
} as const;

/** The high contrast pair, read through `--accent-hc*` under `data-contrast="more"`. */
const WALLPAPER_HIGH_CONTRAST_PROPERTIES = {
    accent: "--wallpaper-accent-hc",
    hover: "--wallpaper-accent-hc-hover",
    active: "--wallpaper-accent-hc-active",
} as const;

/** Writes the derived light / dark pairs onto `element`, or clears them for the fallback. */
export function applyWallpaperAccent(
    element: HTMLElement,
    accent: WallpaperAccent | null,
): void {
    for (
        const [slot, property] of Object.entries(WALLPAPER_ACCENT_PROPERTIES)
    ) {
        const key = slot as keyof typeof WALLPAPER_ACCENT_PROPERTIES;
        if (accent) {
            element.style.setProperty(
                property,
                `light-dark(${accent.light[key]}, ${accent.dark[key]})`,
            );
            element.style.setProperty(`${property}-light`, accent.light[key]);
            element.style.setProperty(`${property}-dark`, accent.dark[key]);
        } else {
            element.style.removeProperty(property);
            element.style.removeProperty(`${property}-light`);
            element.style.removeProperty(`${property}-dark`);
        }
    }
    for (
        const [slot, property] of Object.entries(
            WALLPAPER_HIGH_CONTRAST_PROPERTIES,
        )
    ) {
        const key = slot as keyof typeof WALLPAPER_HIGH_CONTRAST_PROPERTIES;
        if (accent) {
            const { light, dark } = accent.highContrast;
            element.style.setProperty(
                property,
                `light-dark(${light[key]}, ${dark[key]})`,
            );
        } else element.style.removeProperty(property);
    }
    if (accent) {
        element.style.setProperty(
            "--wallpaper-ambient-primary",
            accent.darkTone.ambientPrimary,
        );
        element.style.setProperty(
            "--wallpaper-ambient-secondary",
            accent.darkTone.ambientSecondary,
        );
    } else {
        element.style.removeProperty("--wallpaper-ambient-primary");
        element.style.removeProperty("--wallpaper-ambient-secondary");
    }
}
