import {
    DEFAULT_WALLPAPER_COMPOSITION,
    parseWallpaperSource,
    type WallpaperComposition,
} from "./wallpaper.ts";

export interface WallpaperPresentation {
    composition: WallpaperComposition;
}

export const DEFAULT_WALLPAPER_PRESENTATION: WallpaperPresentation = Object
    .freeze({
        composition: DEFAULT_WALLPAPER_COMPOSITION,
    });

export const MAX_REMOTE_PRESENTATIONS = 24;
const VALID_DATA_IMAGE_REGEX =
    /^data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/=]+$/;

function isValidDataImageUrl(source: string): boolean {
    return VALID_DATA_IMAGE_REGEX.test(source);
}

function normalizeComposition(raw: unknown): WallpaperComposition {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ...DEFAULT_WALLPAPER_COMPOSITION };
    }
    const r = raw as Record<string, unknown>;
    const focalX = typeof r.focalX === "number" && Number.isFinite(r.focalX)
        ? Math.max(0, Math.min(1, r.focalX))
        : DEFAULT_WALLPAPER_COMPOSITION.focalX;
    const focalY = typeof r.focalY === "number" && Number.isFinite(r.focalY)
        ? Math.max(0, Math.min(1, r.focalY))
        : DEFAULT_WALLPAPER_COMPOSITION.focalY;
    return { focalX, focalY };
}

export function normalizeWallpaperPresentation(
    raw: unknown,
): WallpaperPresentation {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ...DEFAULT_WALLPAPER_PRESENTATION };
    }
    const r = raw as Record<string, unknown>;
    return {
        composition: normalizeComposition(r.composition),
    };
}

export function migrateLegacyWallpaperPresentation(
    raw: Record<string, unknown>,
): WallpaperPresentation {
    return {
        composition: normalizeComposition(raw.composition),
    };
}

export function wallpaperPresentation(
    source: string | null | undefined,
    records: Record<string, WallpaperPresentation> | null | undefined,
): WallpaperPresentation {
    if (!source || typeof source !== "string") {
        return { ...DEFAULT_WALLPAPER_PRESENTATION };
    }
    const trimmed = source.trim();
    if (!trimmed || trimmed === "__base__") {
        return { ...DEFAULT_WALLPAPER_PRESENTATION };
    }

    // Check guest data URL
    if (trimmed.startsWith("data:")) {
        if (isValidDataImageUrl(trimmed)) {
            const found = records?.[trimmed];
            if (found) {
                return normalizeWallpaperPresentation(found);
            }
        }
        return { ...DEFAULT_WALLPAPER_PRESENTATION };
    }

    const parsed = parseWallpaperSource(trimmed);
    if (!parsed || parsed.value.startsWith("http://")) {
        return { ...DEFAULT_WALLPAPER_PRESENTATION };
    }

    const key = parsed.value;
    const found = records?.[key];
    if (found) {
        return normalizeWallpaperPresentation(found);
    }

    return { ...DEFAULT_WALLPAPER_PRESENTATION };
}

export interface NormalizeWallpaperPresentationsOptions {
    currentSource?: string | null;
    additionalSources?: readonly (string | null | undefined)[];
    legacy?: Record<string, unknown>;
    legacyCompositions?: Record<string, WallpaperComposition>;
}

function toProtectedSet(
    sources?: string | null | readonly (string | null | undefined)[],
): Set<string> {
    const list = typeof sources === "string" ? [sources] : (sources ?? []);
    const set = new Set<string>();
    for (const item of list) {
        if (typeof item === "string" && item.length > 0) {
            set.add(item);
        }
    }
    return set;
}

export function normalizeWallpaperPresentations(
    raw: unknown,
    options?: NormalizeWallpaperPresentationsOptions,
): Record<string, WallpaperPresentation> {
    const records: Record<string, WallpaperPresentation> = {};
    const protectedSources = toProtectedSet([
        options?.currentSource,
        ...(options?.additionalSources ?? []),
    ]);

    // New records precedence even if empty object (raw is an object, not null/undefined/array)
    const hasNewRecords = raw !== null &&
        raw !== undefined &&
        typeof raw === "object" &&
        !Array.isArray(raw);

    if (hasNewRecords) {
        for (
            const [key, value] of Object.entries(raw as Record<string, unknown>)
        ) {
            if (key.startsWith("data:")) {
                // Retain only valid data image URL matching any active slot
                if (
                    protectedSources.has(key) &&
                    isValidDataImageUrl(key)
                ) {
                    records[key] = normalizeWallpaperPresentation(value);
                }
                continue;
            }
            if (key === "__base__") continue;
            const parsed = parseWallpaperSource(key);
            if (!parsed || parsed.value.startsWith("http://")) continue;
            records[parsed.value] = normalizeWallpaperPresentation(value);
        }
    } else {
        // Fallback / migrate from legacy
        if (options?.legacyCompositions) {
            for (
                const [key, comp] of Object.entries(options.legacyCompositions)
            ) {
                if (key.startsWith("data:")) {
                    if (
                        !protectedSources.has(key) ||
                        !isValidDataImageUrl(key)
                    ) {
                        continue;
                    }
                    records[key] = migrateLegacyWallpaperPresentation({
                        ...(options.legacy ?? {}),
                        composition: comp,
                    });
                    continue;
                }
                if (key === "__base__") continue;
                const parsed = parseWallpaperSource(key);
                if (!parsed || parsed.value.startsWith("http://")) continue;
                records[parsed.value] = migrateLegacyWallpaperPresentation({
                    ...(options.legacy ?? {}),
                    composition: comp,
                });
            }
        }
        for (const cs of protectedSources) {
            if (cs.startsWith("data:")) {
                if (!records[cs] && isValidDataImageUrl(cs)) {
                    records[cs] = migrateLegacyWallpaperPresentation({
                        ...(options?.legacy ?? {}),
                        composition: options?.legacyCompositions?.[cs],
                    });
                }
            } else if (cs !== "__base__") {
                const parsed = parseWallpaperSource(cs);
                if (
                    parsed && !parsed.value.startsWith("http://") &&
                    !records[parsed.value]
                ) {
                    records[parsed.value] = migrateLegacyWallpaperPresentation({
                        ...(options?.legacy ?? {}),
                        composition:
                            options?.legacyCompositions?.[parsed.value] ??
                                options?.legacyCompositions?.[cs],
                    });
                }
            }
        }
    }

    // Retention enforcement: max 24 remote entries
    enforcePresentationRetention(records, [...protectedSources]);

    return records;
}

function enforcePresentationRetention(
    records: Record<string, WallpaperPresentation>,
    protectedSources?: string | null | readonly (string | null | undefined)[],
): void {
    const protectedSet = toProtectedSet(protectedSources);
    // 1. Purge non-current data URLs
    for (const key of Object.keys(records)) {
        if (key.startsWith("data:")) {
            if (!protectedSet.has(key) || !isValidDataImageUrl(key)) {
                delete records[key];
            }
        }
    }
    // 2. Count remote entries
    const remoteKeys: string[] = [];
    for (const key of Object.keys(records)) {
        if (key.startsWith("data:")) continue;
        if (parseWallpaperSource(key)?.type === "remote") {
            remoteKeys.push(key);
        }
    }

    if (remoteKeys.length > MAX_REMOTE_PRESENTATIONS) {
        const excess = remoteKeys.length - MAX_REMOTE_PRESENTATIONS;
        let removed = 0;
        // Evict oldest first (iteration order) skipping protected active slots
        for (const key of remoteKeys) {
            if (removed >= excess) break;
            if (protectedSet.has(key)) continue;
            delete records[key];
            removed++;
        }
    }
}

export function touchWallpaperPresentation(
    records: Record<string, WallpaperPresentation>,
    source: string,
    presentation?: WallpaperPresentation,
    protectedSources?: readonly (string | null | undefined)[],
): Record<string, WallpaperPresentation> {
    const trimmed = source.trim();
    if (!trimmed || trimmed === "__base__") return records;

    let canonicalKey: string;
    if (trimmed.startsWith("data:")) {
        if (!isValidDataImageUrl(trimmed)) {
            return records;
        }
        canonicalKey = trimmed;
    } else {
        const parsed = parseWallpaperSource(trimmed);
        if (!parsed || parsed.value.startsWith("http://")) {
            return records;
        }
        canonicalKey = parsed.value;
    }

    const existing = presentation ?? records[canonicalKey] ??
        DEFAULT_WALLPAPER_PRESENTATION;
    const normalized = normalizeWallpaperPresentation(existing);

    // To place key at the end of iteration order, delete then set
    delete records[canonicalKey];
    delete records[trimmed];
    records[canonicalKey] = normalized;

    enforcePresentationRetention(records, [
        canonicalKey,
        ...(protectedSources ?? []),
    ]);
    return records;
}

export function purgeWallpaperPresentation(
    records: Record<string, WallpaperPresentation>,
    source: string,
): Record<string, WallpaperPresentation> {
    const trimmed = source.trim();
    if (!trimmed) return records;

    delete records[trimmed];
    const parsed = parseWallpaperSource(trimmed);
    if (parsed) {
        delete records[parsed.value];
    }
    return records;
}
