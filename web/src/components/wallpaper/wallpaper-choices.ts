import type { BotanicalSpecies } from "@shared/wallpaper.ts";
import {
    touchWallpaperPresentation,
    type WallpaperPresentation,
    wallpaperPresentation,
} from "@shared/wallpaper-presentation.ts";

export type WallpaperPresentationMap = Record<string, WallpaperPresentation>;

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
    );
    return {
        wallpaper: record.url,
        wallpaperPresentations: nextRecords,
    };
}
