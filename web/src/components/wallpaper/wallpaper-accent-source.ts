import { useEffect, useMemo, useState } from "react";
import type { WallpaperComposition } from "@shared/wallpaper.ts";
import {
    deriveWallpaperAccent,
    type WallpaperAccent,
    type WallpaperPixels,
} from "../../design-system/wallpaper-accent.ts";
import { formatWallpaperCss } from "./WallpaperSurface.tsx";

/** Longest side of the downsampled image; enough for a hue histogram. */
const SAMPLE_SIZE = 64;

export interface WallpaperSample {
    readonly pixels: WallpaperPixels;
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
 * Accent derived from a wallpaper and its focal point. Re-samples only when the
 * source changes; moving the focal point re-derives from the cached pixels.
 */
export function useWallpaperAccent(
    source: string,
    composition: WallpaperComposition,
): WallpaperAccent | null {
    const [sample, setSample] = useState<
        { source: string; value: WallpaperSample | null } | null
    >(null);
    useEffect(() => {
        if (!source) return;
        let alive = true;
        void sampleWallpaper(source).then((value) => {
            if (alive) setSample({ source, value });
        });
        return () => {
            alive = false;
        };
    }, [source]);
    const current = sample?.source === source ? sample.value : null;
    const { focalX, focalY } = composition;
    return useMemo(
        () =>
            current
                ? deriveWallpaperAccent(current.pixels, { focalX, focalY })
                : null,
        [current, focalX, focalY],
    );
}

/** Runtime custom properties `[data-accent="wallpaper"]` reads, per palette slot. */
const WALLPAPER_ACCENT_PROPERTIES = {
    accent: "--wallpaper-accent",
    hover: "--wallpaper-accent-hover",
    active: "--wallpaper-accent-active",
    foreground: "--wallpaper-accent-foreground",
} as const;

/** Writes the derived light / dark pair onto `element`, or clears it for the fallback. */
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
        } else element.style.removeProperty(property);
    }
}
