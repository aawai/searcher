import {
    DEFAULT_WALLPAPER_COMPOSITION,
    parseWallpaperSource,
    type WallpaperComposition,
} from "./wallpaper.ts";

export type WallpaperReadability =
    | "clear"
    | "balanced"
    | "quiet"
    | "focus";

export type WallpaperSoftness =
    | "none"
    | "subtle"
    | "soft"
    | "hazy";

export type WallpaperTone =
    | "natural"
    | "soft"
    | "mono";

export type WallpaperMotion =
    | "off"
    | "ambient"
    | "drift"
    | "zoom";

export type WallpaperMotionLevel =
    | "subtle"
    | "soft"
    | "standard"
    | "pronounced";

export type CanvasMotion =
    | "off"
    | "ambient";

export interface PresetStage<T extends string> {
    readonly id: T;
    readonly label: string;
    readonly detail?: string;
}

export interface WallpaperPresentation {
    composition: WallpaperComposition;
    readability: WallpaperReadability;
    softness: WallpaperSoftness;
    tone: WallpaperTone;
    motion: WallpaperMotion;
    motionLevel: WallpaperMotionLevel;
}

export const WALLPAPER_READABILITY_STAGES: readonly PresetStage<
    WallpaperReadability
>[] = Object.freeze([
    { id: "clear", label: "清透", detail: "12%" },
    { id: "balanced", label: "均衡", detail: "24%" },
    { id: "quiet", label: "沉静", detail: "36%" },
    { id: "focus", label: "专注", detail: "48%" },
]);

export const WALLPAPER_SOFTNESS_STAGES: readonly PresetStage<
    WallpaperSoftness
>[] = Object.freeze([
    { id: "none", label: "无", detail: "0px" },
    { id: "subtle", label: "轻柔", detail: "2px" },
    { id: "soft", label: "柔和", detail: "5px" },
    { id: "hazy", label: "朦胧", detail: "9px" },
]);

export const WALLPAPER_TONE_STAGES: readonly PresetStage<WallpaperTone>[] =
    Object.freeze([
        { id: "natural", label: "原色" },
        { id: "soft", label: "柔和" },
        { id: "mono", label: "黑白" },
    ]);

export const WALLPAPER_MOTION_STAGES: readonly PresetStage<WallpaperMotion>[] =
    Object.freeze([
        { id: "off", label: "关闭" },
        { id: "ambient", label: "环境光" },
        { id: "drift", label: "漂移" },
        { id: "zoom", label: "推近" },
    ]);

export const WALLPAPER_MOTION_LEVEL_STAGES: readonly PresetStage<
    WallpaperMotionLevel
>[] = Object.freeze([
    { id: "subtle", label: "轻微" },
    { id: "soft", label: "柔和" },
    { id: "standard", label: "标准" },
    { id: "pronounced", label: "明显" },
]);

export const CANVAS_MOTION_STAGES: readonly PresetStage<CanvasMotion>[] = Object
    .freeze([
        { id: "off", label: "关闭" },
        { id: "ambient", label: "环境光" },
    ]);

export const DEFAULT_WALLPAPER_PRESENTATION: WallpaperPresentation = Object
    .freeze({
        composition: DEFAULT_WALLPAPER_COMPOSITION,
        readability: "balanced",
        softness: "none",
        tone: "natural",
        motion: "off",
        motionLevel: "soft",
    });

export const DEFAULT_CANVAS_MOTION: CanvasMotion = "off";
export const DEFAULT_CANVAS_MOTION_LEVEL: WallpaperMotionLevel = "soft";

export const WALLPAPER_READABILITY_MASKS: Record<WallpaperReadability, number> =
    {
        clear: 0.12,
        balanced: 0.24,
        quiet: 0.36,
        focus: 0.48,
    };

export const WALLPAPER_SOFTNESS_BLURS: Record<WallpaperSoftness, number> = {
    none: 0,
    subtle: 2,
    soft: 5,
    hazy: 9,
};

export interface WallpaperToneValues {
    readonly brightness: number;
    readonly saturate: number;
    readonly contrast: number;
    readonly grayscale: number;
}

export const WALLPAPER_TONE_VALUES: Record<
    "light" | "dark",
    Record<WallpaperTone, WallpaperToneValues>
> = {
    light: {
        natural: { brightness: 1, saturate: 1, contrast: 1, grayscale: 0 },
        soft: {
            brightness: 0.99,
            saturate: 0.86,
            contrast: 0.96,
            grayscale: 0,
        },
        mono: { brightness: 0.98, saturate: 0, contrast: 0.96, grayscale: 1 },
    },
    dark: {
        natural: { brightness: 1, saturate: 1, contrast: 1, grayscale: 0 },
        soft: {
            brightness: 0.90,
            saturate: 0.80,
            contrast: 0.94,
            grayscale: 0,
        },
        mono: { brightness: 0.86, saturate: 0, contrast: 0.92, grayscale: 1 },
    },
};

export interface WallpaperAmbientStageParams {
    readonly mix: number;
    readonly travel: number;
    readonly scale: number;
}

export const WALLPAPER_AMBIENT_PARAMS: Record<
    WallpaperMotionLevel,
    WallpaperAmbientStageParams
> = {
    subtle: { mix: 3.5, travel: 1.2, scale: 1.010 },
    soft: { mix: 5.0, travel: 1.8, scale: 1.016 },
    standard: { mix: 6.5, travel: 2.4, scale: 1.022 },
    pronounced: { mix: 8.0, travel: 3.2, scale: 1.028 },
};

export interface WallpaperDriftStageParams {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
}

export const WALLPAPER_DRIFT_PARAMS: Record<
    WallpaperMotionLevel,
    WallpaperDriftStageParams
> = {
    subtle: { x: 0.25, y: 0.18, scale: 1.012 },
    soft: { x: 0.45, y: 0.30, scale: 1.017 },
    standard: { x: 0.65, y: 0.45, scale: 1.023 },
    pronounced: { x: 0.90, y: 0.60, scale: 1.032 },
};

export interface WallpaperZoomStageParams {
    readonly scale: number;
}

export const WALLPAPER_ZOOM_PARAMS: Record<
    WallpaperMotionLevel,
    WallpaperZoomStageParams
> = {
    subtle: { scale: 1.012 },
    soft: { scale: 1.020 },
    standard: { scale: 1.028 },
    pronounced: { scale: 1.040 },
};

export const WALLPAPER_MOTION_TIMING = Object.freeze({
    ambient: Object.freeze({
        layerCount: 2,
        radiusA: "58vmax",
        radiusB: "42vmax",
        durationA: 28,
        durationB: 37,
        phaseOffset: 7,
        easing: "cubic-bezier(0.45, 0, 0.55, 1)",
    }),
    drift: Object.freeze({
        duration: 54,
        easing: "cubic-bezier(0.45, 0, 0.55, 1)",
    }),
    zoom: Object.freeze({
        duration: 58,
        easing: "cubic-bezier(0.45, 0, 0.55, 1)",
    }),
});

export const GLOBAL_MOTION_BUDGET = Object.freeze({
    maxAccentContributionPercent: 8.0,
    maxMovementPercent: 1.0,
    maxZoomDeltaPercent: 4.0,
    minDurationSeconds: 28,
    maxMovingAmbientFields: 2,
});

export const MAX_REMOTE_OR_GRADIENT_PRESENTATIONS = 24;
const VALID_DATA_IMAGE_REGEX =
    /^data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/=]+$/;

function isValidDataImageUrl(source: string): boolean {
    return VALID_DATA_IMAGE_REGEX.test(source);
}

const VALID_READABILITY: Record<WallpaperReadability, true> = {
    clear: true,
    balanced: true,
    quiet: true,
    focus: true,
};
const VALID_SOFTNESS: Record<WallpaperSoftness, true> = {
    none: true,
    subtle: true,
    soft: true,
    hazy: true,
};
const VALID_TONE: Record<WallpaperTone, true> = {
    natural: true,
    soft: true,
    mono: true,
};
const VALID_MOTION: Record<WallpaperMotion, true> = {
    off: true,
    ambient: true,
    drift: true,
    zoom: true,
};
const VALID_MOTION_LEVEL: Record<WallpaperMotionLevel, true> = {
    subtle: true,
    soft: true,
    standard: true,
    pronounced: true,
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
        softness: typeof r.softness === "string" &&
                Boolean(VALID_SOFTNESS[r.softness as WallpaperSoftness])
            ? (r.softness as WallpaperSoftness)
            : DEFAULT_WALLPAPER_PRESENTATION.softness,
        tone: typeof r.tone === "string" &&
                Boolean(VALID_TONE[r.tone as WallpaperTone])
            ? (r.tone as WallpaperTone)
            : DEFAULT_WALLPAPER_PRESENTATION.tone,
        motion: typeof r.motion === "string" &&
                Boolean(VALID_MOTION[r.motion as WallpaperMotion])
            ? (r.motion as WallpaperMotion)
            : DEFAULT_WALLPAPER_PRESENTATION.motion,
        motionLevel: typeof r.motionLevel === "string" &&
                Boolean(
                    VALID_MOTION_LEVEL[r.motionLevel as WallpaperMotionLevel],
                )
            ? (r.motionLevel as WallpaperMotionLevel)
            : DEFAULT_WALLPAPER_PRESENTATION.motionLevel,
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
    const blurRaw = typeof raw.wallpaperBlur === "number" &&
            Number.isFinite(raw.wallpaperBlur)
        ? raw.wallpaperBlur
        : (typeof raw.blur === "number" && Number.isFinite(raw.blur)
            ? raw.blur
            : 0);
    const grayRaw = typeof raw.wallpaperGrayscale === "number" &&
            Number.isFinite(raw.wallpaperGrayscale)
        ? raw.wallpaperGrayscale
        : (typeof raw.grayscale === "number" && Number.isFinite(raw.grayscale)
            ? raw.grayscale
            : 0);

    const mode = typeof raw.ambientMotionMode === "string"
        ? raw.ambientMotionMode
        : undefined;
    const strength = typeof raw.ambientMotionStrength === "number" &&
            Number.isFinite(raw.ambientMotionStrength)
        ? raw.ambientMotionStrength
        : 0;
    const glow = typeof raw.wallpaperGlowStrength === "number" &&
            Number.isFinite(raw.wallpaperGlowStrength)
        ? raw.wallpaperGlowStrength
        : 0;

    const contrib = Math.max(strength, glow * 2.5);

    return {
        composition: normalizeComposition(raw.composition),
        readability: maskRaw <= 0.18
            ? "clear"
            : maskRaw <= 0.30
            ? "balanced"
            : maskRaw <= 0.42
            ? "quiet"
            : "focus",
        softness: blurRaw <= 1
            ? "none"
            : blurRaw <= 3.5
            ? "subtle"
            : blurRaw <= 7
            ? "soft"
            : "hazy",
        tone: grayRaw <= 0.15 ? "natural" : grayRaw <= 0.70 ? "soft" : "mono",
        motion: mode === "off"
            ? "off"
            : mode === "breathe" || mode === "breathe_ripple" || glow > 0 ||
                    (strength > 0.01 && mode !== undefined)
            ? "ambient"
            : "off",
        motionLevel: contrib <= 0.20
            ? "subtle"
            : contrib <= 0.40
            ? "soft"
            : contrib <= 0.65
            ? "standard"
            : "pronounced",
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

export interface WallpaperOverscan {
    readonly percentageX: number;
    readonly percentageY: number;
    readonly pixelsX: number;
    readonly pixelsY: number;
    readonly scale: number;
}

export function calculateWallpaperOverscan(options?: {
    blur?: number;
    motion?: WallpaperMotion;
    motionLevel?: WallpaperMotionLevel;
}): WallpaperOverscan {
    const blur =
        typeof options?.blur === "number" && Number.isFinite(options.blur) &&
            options.blur > 0
            ? options.blur
            : 0;
    const motion = options?.motion ?? "off";
    const level = options?.motionLevel ?? "soft";

    if (motion === "drift") {
        const stage = WALLPAPER_DRIFT_PARAMS[level];
        const tx = stage.x / 100;
        const ty = stage.y / 100;
        const denomX = 1 - 2 * tx;
        const denomY = 1 - 2 * ty;

        const percentageX = (100 * tx) / denomX;
        const percentageY = (100 * ty) / denomY;
        const pixelsX = (3 * blur * stage.scale) / denomX;
        const pixelsY = (3 * blur * stage.scale) / denomY;

        return {
            percentageX,
            percentageY,
            pixelsX,
            pixelsY,
            scale: stage.scale,
        };
    }

    if (motion === "zoom") {
        const stage = WALLPAPER_ZOOM_PARAMS[level];
        const delta = Math.max(0, stage.scale - 1);
        const percentage = 100 * delta;
        const pixels = 3 * blur * stage.scale;

        return {
            percentageX: percentage,
            percentageY: percentage,
            pixelsX: pixels,
            pixelsY: pixels,
            scale: stage.scale,
        };
    }

    // Ambient or off
    return {
        percentageX: 0,
        percentageY: 0,
        pixelsX: 3 * blur,
        pixelsY: 3 * blur,
        scale: 1,
    };
}

export interface ResolveWallpaperPresentationOptions {
    theme: "light" | "dark";
    hasWallpaper?: boolean;
    reducedMotion?: boolean;
}

export interface ResolvedWallpaperPresentation {
    readonly tone: WallpaperTone;
    readonly mask: number;
    readonly blur: number;
    readonly filter: string;
    readonly motion: WallpaperMotion;
    readonly motionLevel: WallpaperMotionLevel;
    readonly composition: WallpaperComposition;
    readonly ambient: {
        readonly mix: number;
        readonly fieldMix: number;
        readonly travel: number;
        readonly scale: number;
        readonly neutral: boolean;
    };
    readonly drift: {
        readonly x: number;
        readonly y: number;
        readonly scale: number;
    };
    readonly zoom: {
        readonly scale: number;
    };
    readonly overscan: WallpaperOverscan;
    readonly timing: typeof WALLPAPER_MOTION_TIMING;
}

export function resolveWallpaperPresentation(
    presentation: WallpaperPresentation,
    options: ResolveWallpaperPresentationOptions,
): ResolvedWallpaperPresentation {
    const hasWallpaper = options.hasWallpaper !== false;
    const reducedMotion = options.reducedMotion === true;
    const theme = options.theme === "dark" ? "dark" : "light";

    // 1. Mask, Blur, Tone
    let mask = 0;
    let blur = 0;
    let toneValues = WALLPAPER_TONE_VALUES[theme].natural;

    if (hasWallpaper) {
        mask = WALLPAPER_READABILITY_MASKS[presentation.readability];
        blur = WALLPAPER_SOFTNESS_BLURS[presentation.softness];
        toneValues = WALLPAPER_TONE_VALUES[theme][presentation.tone];
    }

    const filter =
        `blur(${blur}px) brightness(${toneValues.brightness}) saturate(${toneValues.saturate}) contrast(${toneValues.contrast}) grayscale(${toneValues.grayscale})`;

    // 2. Motion resolution
    // hasWallpaper === false: drift and zoom downgrade to "off", ambient is allowed.
    // reducedMotion === true: drift and zoom downgrade to "off", ambient stays "ambient" with static field (travel: 0, scale: 1).
    let resolvedMotion: WallpaperMotion = presentation.motion;
    if (!hasWallpaper) {
        if (resolvedMotion === "drift" || resolvedMotion === "zoom") {
            resolvedMotion = "off";
        }
    }
    if (reducedMotion) {
        if (resolvedMotion === "drift" || resolvedMotion === "zoom") {
            resolvedMotion = "off";
        }
    }

    // 3. Ambient resolution
    let ambientMix = 0;
    let ambientTravel = 0;
    let ambientScale = 1;
    let ambientNeutral = false;

    if (resolvedMotion === "ambient") {
        const stage = WALLPAPER_AMBIENT_PARAMS[presentation.motionLevel];
        if (presentation.tone === "natural") {
            ambientMix = stage.mix;
            ambientNeutral = false;
        } else if (presentation.tone === "soft") {
            ambientMix = Number((stage.mix * 0.85).toFixed(3));
            ambientNeutral = false;
        } else {
            // mono: retain stage luminance mix so neutral field is visible, neutral: true ensures 0 accent contribution
            ambientMix = stage.mix;
            ambientNeutral = true;
        }

        if (reducedMotion) {
            ambientTravel = 0;
            ambientScale = 1;
        } else {
            ambientTravel = stage.travel;
            ambientScale = stage.scale;
        }
    }

    const ambientFieldMix = Number((ambientMix / 2).toFixed(3));

    // 4. Drift resolution
    let driftX = 0;
    let driftY = 0;
    let driftScale = 1;

    if (resolvedMotion === "drift") {
        const stage = WALLPAPER_DRIFT_PARAMS[presentation.motionLevel];
        driftX = stage.x;
        driftY = stage.y;
        driftScale = stage.scale;
    }

    // 5. Zoom resolution
    let zoomScale = 1;
    if (resolvedMotion === "zoom") {
        const stage = WALLPAPER_ZOOM_PARAMS[presentation.motionLevel];
        zoomScale = stage.scale;
    }

    // 6. Composition & Overscan
    const composition = hasWallpaper
        ? presentation.composition
        : { focalX: 0.5, focalY: 0.5 };

    const overscan = calculateWallpaperOverscan({
        blur,
        motion: resolvedMotion,
        motionLevel: presentation.motionLevel,
    });

    return {
        tone: hasWallpaper ? presentation.tone : "natural",
        mask,
        blur,
        filter,
        motion: resolvedMotion,
        motionLevel: presentation.motionLevel,
        composition,
        ambient: {
            mix: ambientMix,
            fieldMix: ambientFieldMix,
            travel: ambientTravel,
            scale: ambientScale,
            neutral: ambientNeutral,
        },
        drift: {
            x: driftX,
            y: driftY,
            scale: driftScale,
        },
        zoom: {
            scale: zoomScale,
        },
        overscan,
        timing: WALLPAPER_MOTION_TIMING,
    };
}
