export interface WallpaperComposition {
    focalX: number;
    focalY: number;
}

export const DEFAULT_WALLPAPER_COMPOSITION: WallpaperComposition = Object
    .freeze(
        {
            focalX: 0.5,
            focalY: 0.5,
        },
    );

export const BOTANICAL_SPECIES = [
    "auto",
    "ginkgo",
    "eucalyptus",
    "plum",
    "fern",
] as const;

export type BotanicalSpecies = typeof BOTANICAL_SPECIES[number];

const BOTANICAL_SCENE_PREFIX = "scene:botanical:";
const BOTANICAL_SPECIES_SET: ReadonlySet<string> = new Set(BOTANICAL_SPECIES);

export function normalizeBotanicalSpecies(
    raw: unknown,
): BotanicalSpecies | null {
    if (typeof raw !== "string") return null;
    const normalized = raw.trim().toLowerCase();
    return BOTANICAL_SPECIES_SET.has(normalized)
        ? normalized as BotanicalSpecies
        : null;
}

export function parseBotanicalSceneSource(
    value: unknown,
): BotanicalSpecies | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed.toLowerCase().startsWith(BOTANICAL_SCENE_PREFIX)) {
        return null;
    }
    return normalizeBotanicalSpecies(
        trimmed.slice(BOTANICAL_SCENE_PREFIX.length),
    );
}

export type WallpaperSource =
    | {
        type: "uploaded";
        value: string;
    }
    | {
        type: "remote";
        value: string;
    };

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseWallpaperSource(value: string): WallpaperSource | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 2048) return null;

    // 1. Uploaded wallpaper: /api/wallpaper/:uuid
    if (trimmed.startsWith("/api/wallpaper/")) {
        const id = trimmed.slice("/api/wallpaper/".length);
        if (UUID_REGEX.test(id)) {
            return {
                type: "uploaded",
                value: `/api/wallpaper/${id.toLowerCase()}`,
            };
        }
        return null;
    }

    // 2. Remote HTTPS URL
    if (trimmed.startsWith("https://")) {
        try {
            const url = new URL(trimmed);
            if (
                url.protocol === "https:" &&
                !url.username &&
                !url.password &&
                url.hostname &&
                !url.host.includes("@")
            ) {
                return {
                    type: "remote",
                    value: url.toString(),
                };
            }
        } catch {
            return null;
        }
        return null;
    }

    return null;
}

export function normalizeWallpaperCompositions(
    raw: unknown,
): Record<string, WallpaperComposition> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }
    const result: Record<string, WallpaperComposition> = {};
    for (const [key, val] of Object.entries(raw)) {
        if (typeof key !== "string" || key.trim() === "") {
            continue;
        }
        if (!val || typeof val !== "object" || Array.isArray(val)) {
            continue;
        }
        const v = val as Record<string, unknown>;
        const rawX = v.focalX;
        const rawY = v.focalY;
        const focalX = typeof rawX === "number" && Number.isFinite(rawX)
            ? Math.max(0, Math.min(1, rawX))
            : 0.5;
        const focalY = typeof rawY === "number" && Number.isFinite(rawY)
            ? Math.max(0, Math.min(1, rawY))
            : 0.5;
        result[key] = { focalX, focalY };
    }
    return result;
}
