import type { DarkWallpaperMode } from "@shared/contracts.ts";
import type { BotanicalSpecies } from "@shared/wallpaper.ts";
import {
    touchWallpaperPresentation,
    type WallpaperPresentation,
    wallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";
import type { ColorScheme } from "../../design-system/theme.ts";

export type WallpaperPresentationMap = Record<string, WallpaperPresentation>;

export const DARK_WALLPAPER_MODE_CHOICES: ReadonlyArray<
    readonly [DarkWallpaperMode, string, string]
> = [
    ["follow", "跟随浅色", "跟随"],
    ["ambient", "氛围流光", "流光"],
    ["canvas", "深黑画布", "纯黑"],
    ["custom", "独立壁纸", "独立"],
];

export interface EffectiveWallpaper {
    readonly source: string;
    readonly renderMode: "image" | "ambient" | "canvas";
    readonly hasImageOverlay: boolean;
}

export function resolveEffectiveWallpaper(input: {
    scheme: ColorScheme;
    wallpaper: string;
    darkWallpaper: string;
    darkWallpaperMode: DarkWallpaperMode;
}): EffectiveWallpaper {
    if (input.scheme === "light") {
        return {
            source: input.wallpaper,
            renderMode: input.wallpaper ? "image" : "canvas",
            hasImageOverlay: Boolean(input.wallpaper),
        };
    }
    switch (input.darkWallpaperMode) {
        case "canvas":
            return {
                source: "",
                renderMode: "canvas",
                hasImageOverlay: false,
            };
        case "custom":
            return {
                source: input.darkWallpaper,
                renderMode: input.darkWallpaper ? "image" : "canvas",
                hasImageOverlay: Boolean(input.darkWallpaper),
            };
        case "ambient":
            return {
                source: input.wallpaper,
                renderMode: input.wallpaper ? "ambient" : "canvas",
                hasImageOverlay: false,
            };
        case "follow":
        default:
            return {
                source: input.wallpaper,
                renderMode: input.wallpaper ? "image" : "canvas",
                hasImageOverlay: Boolean(input.wallpaper),
            };
    }
}

export const BOTANICAL_SCENE_CHOICES: ReadonlyArray<
    readonly [BotanicalSpecies, string]
> = [
    ["auto", "每日"],
    ["ginkgo", "银杏"],
    ["eucalyptus", "尤加利"],
    ["plum", "寒梅"],
    ["fern", "蕨类"],
];

export interface WallpaperHistoryRecord {
    id: string;
    url: string;
    focalX?: number;
    focalY?: number;
}

const MAX_QUICK_WALLPAPERS = 5;

/**
 * Builds up to 5 wallpaper items for quick switching.
 * If a non-empty current wallpaper (e.g., remote HTTPS or guest local image)
 * is not in history, place it first and cap the total at 5 items.
 */
export function buildWallpaperHistoryItems(
    currentWallpaper: string,
    history: readonly WallpaperHistoryRecord[],
): WallpaperHistoryRecord[] {
    if (!currentWallpaper) {
        return history.slice(0, MAX_QUICK_WALLPAPERS);
    }
    if (history.some((item) => item.url === currentWallpaper)) {
        return history.slice(0, MAX_QUICK_WALLPAPERS);
    }
    return [
        { id: "current", url: currentWallpaper },
        ...history.slice(0, MAX_QUICK_WALLPAPERS - 1),
    ];
}

/**
 * Computes the appearance patch for selecting a wallpaper from history,
 * preserving its stored or record-level focal composition.
 */
export function buildWallpaperSelectionPatch(
    record: WallpaperHistoryRecord,
    presentations: WallpaperPresentationMap,
    protectedSources?: readonly (string | null | undefined)[],
): {
    wallpaper: string;
    wallpaperPresentations: WallpaperPresentationMap;
} {
    const existingPres = wallpaperPresentation(record.url, presentations);
    const focal = {
        focalX: record.focalX ?? existingPres.composition.focalX ?? 0.5,
        focalY: record.focalY ?? existingPres.composition.focalY ?? 0.5,
    };
    const nextPres: WallpaperPresentation = {
        ...existingPres,
        composition: focal,
    };
    const nextRecords = touchWallpaperPresentation(
        { ...presentations },
        record.url,
        nextPres,
        protectedSources,
    );
    return {
        wallpaper: record.url,
        wallpaperPresentations: nextRecords,
    };
}

export function buildDarkWallpaperSelectionPatch(
    record: WallpaperHistoryRecord,
    presentations: WallpaperPresentationMap,
    protectedSources?: readonly (string | null | undefined)[],
): {
    darkWallpaper: string;
    wallpaperPresentations: WallpaperPresentationMap;
} {
    const existingPres = wallpaperPresentation(record.url, presentations);
    const focal = {
        focalX: record.focalX ?? existingPres.composition.focalX ?? 0.5,
        focalY: record.focalY ?? existingPres.composition.focalY ?? 0.5,
    };
    const nextPres: WallpaperPresentation = {
        ...existingPres,
        composition: focal,
    };
    const nextRecords = touchWallpaperPresentation(
        { ...presentations },
        record.url,
        nextPres,
        protectedSources,
    );
    return {
        darkWallpaper: record.url,
        wallpaperPresentations: nextRecords,
    };
}
