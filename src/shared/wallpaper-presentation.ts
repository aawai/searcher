import {
    DEFAULT_WALLPAPER_COMPOSITION,
    parseWallpaperSource,
    type WallpaperComposition,
} from "./wallpaper.ts";

export type WallpaperReadability =
    | "none"
    | "clear"
    | "balanced"
    | "quiet"
    | "focus";

export interface PresetStage<T extends string> {
    readonly id: T;
    readonly label: string;
    readonly detail?: string;
}

export interface WallpaperPresentation {
    composition: WallpaperComposition;
    readability: WallpaperReadability;
}

export const WALLPAPER_READABILITY_STAGES: readonly PresetStage<
    WallpaperReadability
>[] = Object.freeze([
    { id: "none", label: "无", detail: "0%" },
    { id: "clear", label: "清透", detail: "12%" },
    { id: "balanced", label: "均衡", detail: "24%" },
    { id: "quiet", label: "沉静", detail: "36%" },
    { id: "focus", label: "专注", detail: "48%" },
]);

export const DEFAULT_WALLPAPER_PRESENTATION: WallpaperPresentation = Object
    .freeze({
        composition: DEFAULT_WALLPAPER_COMPOSITION,
        readability: "balanced",
    });

export const WALLPAPER_READABILITY_MASKS: Record<WallpaperReadability, number> =
    {
        none: 0,
        clear: 0.12,
        balanced: 0.24,
        quiet: 0.36,
        focus: 0.48,
    };

export const MAX_REMOTE_OR_GRADIENT_PRESENTATIONS = 24;
const VALID_DATA_IMAGE_REGEX =
    /^data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/=]+$/;

function isValidDataImageUrl(source: string): boolean {
    return VALID_DATA_IMAGE_REGEX.test(source);
}

const VALID_READABILITY: Record<WallpaperReadability, true> = {
    none: true,
    clear: true,
    balanced: true,
    quiet: true,
    focus: true,
};

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
        readability: typeof r.readability === "string" &&
                Boolean(
                    VALID_READABILITY[r.readability as WallpaperReadability],
                )
            ? (r.readability as WallpaperReadability)
            : DEFAULT_WALLPAPER_PRESENTATION.readability,
    };
}

export function migrateLegacyWallpaperPresentation(
    raw: Record<string, unknown>,
): WallpaperPresentation {
    const maskRaw = typeof raw.wallpaperMask === "number" &&
            Number.isFinite(raw.wallpaperMask)
        ? raw.wallpaperMask
        : (typeof raw.mask === "number" && Number.isFinite(raw.mask)
            ? raw.mask
            : 0.24);

    return {
        composition: normalizeComposition(raw.composition),
        readability:
            raw.readability === "none" || raw.wallpaperReadability === "none"
                ? "none"
                : maskRaw <= 0.18
                ? "clear"
                : maskRaw <= 0.30
                ? "balanced"
                : maskRaw <= 0.42
                ? "quiet"
                : "focus",
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
        const normalized = normalizeWallpaperPresentation(found);
        // Gradient always keeps center focal point
        if (parsed.type === "gradient") {
            normalized.composition = { focalX: 0.5, focalY: 0.5 };
        }
        return normalized;
    }

    // Unrecorded gradient default center composition
    if (parsed.type === "gradient") {
        return {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            composition: { focalX: 0.5, focalY: 0.5 },
        };
    }

    return { ...DEFAULT_WALLPAPER_PRESENTATION };
}

export interface NormalizeWallpaperPresentationsOptions {
    currentSource?: string | null;
    legacy?: Record<string, unknown>;
    legacyCompositions?: Record<string, WallpaperComposition>;
}

export function normalizeWallpaperPresentations(
    raw: unknown,
    options?: NormalizeWallpaperPresentationsOptions,
): Record<string, WallpaperPresentation> {
    const records: Record<string, WallpaperPresentation> = {};

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
                // Retain only valid data image URL matching currentSource
                if (
                    key === options?.currentSource &&
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
                        key !== options?.currentSource ||
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
        if (options?.currentSource && !records[options.currentSource]) {
            const cs = options.currentSource;
            if (cs.startsWith("data:")) {
                if (isValidDataImageUrl(cs)) {
                    records[cs] = migrateLegacyWallpaperPresentation({
                        ...(options.legacy ?? {}),
                        composition: options.legacyCompositions?.[cs],
                    });
                }
            } else if (cs !== "__base__") {
                const parsed = parseWallpaperSource(cs);
                if (
                    parsed && !parsed.value.startsWith("http://") &&
                    !records[parsed.value]
                ) {
                    records[parsed.value] = migrateLegacyWallpaperPresentation({
                        ...(options.legacy ?? {}),
                        composition:
                            options.legacyCompositions?.[parsed.value] ??
                                options.legacyCompositions?.[cs],
                    });
                }
            }
        }
    }

    // Retention enforcement: max 24 remote / gradient entries
    enforcePresentationRetention(records, options?.currentSource);

    return records;
}

function enforcePresentationRetention(
    records: Record<string, WallpaperPresentation>,
    currentSource?: string | null,
): void {
    // 1. Purge non-current data URLs
    for (const key of Object.keys(records)) {
        if (key.startsWith("data:")) {
            if (key !== currentSource || !isValidDataImageUrl(key)) {
                delete records[key];
            }
        }
    }
    // 2. Count remote / gradient entries
    const remoteOrGradientKeys: string[] = [];
    for (const key of Object.keys(records)) {
        if (key.startsWith("data:")) continue;
        const parsed = parseWallpaperSource(key);
        if (parsed?.type === "remote" || parsed?.type === "gradient") {
            remoteOrGradientKeys.push(key);
        }
    }

    if (remoteOrGradientKeys.length > MAX_REMOTE_OR_GRADIENT_PRESENTATIONS) {
        const excess = remoteOrGradientKeys.length -
            MAX_REMOTE_OR_GRADIENT_PRESENTATIONS;
        let removed = 0;
        // Evict oldest first (iteration order) skipping currentSource
        for (const key of remoteOrGradientKeys) {
            if (removed >= excess) break;
            if (key === currentSource) continue;
            delete records[key];
            removed++;
        }
    }
}

export function touchWallpaperPresentation(
    records: Record<string, WallpaperPresentation>,
    source: string,
    presentation?: WallpaperPresentation,
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

    enforcePresentationRetention(records, canonicalKey);
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
