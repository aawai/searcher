import { assertEquals } from "@std/assert";
import {
    DEFAULT_WALLPAPER_PRESENTATION,
    MAX_REMOTE_PRESENTATIONS,
    migrateLegacyWallpaperPresentation,
    normalizeWallpaperPresentation,
    normalizeWallpaperPresentations,
    purgeWallpaperPresentation,
    touchWallpaperPresentation,
    type WallpaperPresentation,
    wallpaperPresentation,
} from "./wallpaper-presentation.ts";

Deno.test("wallpaper-presentation: normalizeWallpaperPresentation handles valid and fallback inputs", () => {
    const valid: WallpaperPresentation = {
        composition: { focalX: 0.2, focalY: 0.8 },
        readability: "clear",
    };
    assertEquals(normalizeWallpaperPresentation(valid), valid);

    // Missing / invalid fallback to canonical defaults
    assertEquals(
        normalizeWallpaperPresentation(null),
        DEFAULT_WALLPAPER_PRESENTATION,
    );
    assertEquals(
        normalizeWallpaperPresentation(undefined),
        DEFAULT_WALLPAPER_PRESENTATION,
    );
    assertEquals(
        normalizeWallpaperPresentation({}),
        DEFAULT_WALLPAPER_PRESENTATION,
    );

    // Clamps focal composition and defaults invalid semantic IDs
    const malformed = {
        composition: { focalX: -5, focalY: 10 },
        readability: "unknown",
    };
    assertEquals(normalizeWallpaperPresentation(malformed), {
        composition: { focalX: 0, focalY: 1 },
        readability: "balanced",
    });

    // Keys outside { composition, readability } are dropped
    assertEquals(
        normalizeWallpaperPresentation({ ...valid, retiredKey: "legacy" }),
        valid,
    );
});

Deno.test("wallpaper-presentation: migrateLegacyWallpaperPresentation maps mask to readability and keeps composition", () => {
    // 1. mask -> readability: <=0.18 clear, <=0.30 balanced, <=0.42 quiet, >0.42 focus
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperMask: 0.12 }).readability,
        "clear",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperMask: 0.18 }).readability,
        "clear",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperMask: 0.24 }).readability,
        "balanced",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperMask: 0.30 }).readability,
        "balanced",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperMask: 0.36 }).readability,
        "quiet",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperMask: 0.42 }).readability,
        "quiet",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperMask: 0.48 }).readability,
        "focus",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperMask: 0.80 }).readability,
        "focus",
    );

    // Guest alias: mask
    assertEquals(
        migrateLegacyWallpaperPresentation({ mask: 0.15 }).readability,
        "clear",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ mask: 0 }).readability,
        "clear",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ readability: "none" }).readability,
        "none",
    );

    // Missing mask uses the default 0.24, which maps to balanced
    assertEquals(
        migrateLegacyWallpaperPresentation({}).readability,
        "balanced",
    );

    // 2. Source-specific composition passed via raw.composition
    const withComp = migrateLegacyWallpaperPresentation({
        composition: { focalX: 0.25, focalY: 0.75 },
    });
    assertEquals(withComp.composition, { focalX: 0.25, focalY: 0.75 });
});

Deno.test("wallpaper-presentation: migration idempotence", () => {
    const raw = {
        wallpaperMask: 0.36,
        composition: { focalX: 0.4, focalY: 0.6 },
    };
    const migrated = migrateLegacyWallpaperPresentation(raw);
    const normalized = normalizeWallpaperPresentation(migrated);
    assertEquals(normalized, migrated);

    // Re-normalizing produces exact same result
    const reNormalized = normalizeWallpaperPresentation(normalized);
    assertEquals(reNormalized, normalized);
});

Deno.test("wallpaper-presentation: wallpaperPresentation lookup and defaults", () => {
    const records: Record<string, WallpaperPresentation> = {
        "https://images.example.com/photo.jpg": {
            composition: { focalX: 0.1, focalY: 0.9 },
            readability: "quiet",
        },
    };

    // 1. Empty / null / undefined -> canonical defaults
    assertEquals(
        wallpaperPresentation(null, records),
        DEFAULT_WALLPAPER_PRESENTATION,
    );
    assertEquals(
        wallpaperPresentation(undefined, records),
        DEFAULT_WALLPAPER_PRESENTATION,
    );
    assertEquals(
        wallpaperPresentation("", records),
        DEFAULT_WALLPAPER_PRESENTATION,
    );

    // 2. Found remote image
    assertEquals(
        wallpaperPresentation("https://images.example.com/photo.jpg", records),
        records["https://images.example.com/photo.jpg"],
    );

    // 3. Unrecorded remote source returns canonical defaults
    const unrecordedRemote = wallpaperPresentation(
        "https://example.com/unrecorded.jpg",
        records,
    );
    assertEquals(unrecordedRemote, DEFAULT_WALLPAPER_PRESENTATION);

    // 4. Rejection of __base__, insecure http, and invalid data URLs
    assertEquals(
        wallpaperPresentation("__base__", records),
        DEFAULT_WALLPAPER_PRESENTATION,
    );
    assertEquals(
        wallpaperPresentation("http://insecure.com/a.jpg", records),
        DEFAULT_WALLPAPER_PRESENTATION,
    );
    assertEquals(
        wallpaperPresentation("data:text/html;base64,abc", records),
        DEFAULT_WALLPAPER_PRESENTATION,
    );
});

Deno.test("wallpaper-presentation: normalizeWallpaperPresentations migration and retention", () => {
    // 1. Prefers new records when available
    const newRecords = {
        "https://images.example.com/a.jpg": {
            composition: { focalX: 0.3, focalY: 0.7 },
            readability: "clear",
        },
    };
    const normalized = normalizeWallpaperPresentations(newRecords, {
        currentSource: "https://images.example.com/a.jpg",
        legacy: { wallpaperMask: 0.48 },
    });
    assertEquals(
        normalized["https://images.example.com/a.jpg"].readability,
        "clear",
    );
    // 2. Empty object new records precedence: does not resurrect legacy
    const emptyNewRecords = normalizeWallpaperPresentations({}, {
        currentSource: "https://images.example.com/legacy.jpg",
        legacy: { wallpaperMask: 0.48 },
        legacyCompositions: {
            "https://images.example.com/legacy.jpg": {
                focalX: 0.1,
                focalY: 0.2,
            },
        },
    });
    assertEquals(emptyNewRecords, {});

    // 3. Fallback to legacy migration when raw is null/undefined
    const legacyCompositions = {
        "https://images.example.com/legacy.jpg": { focalX: 0.1, focalY: 0.2 },
    };
    const migratedFromLegacy = normalizeWallpaperPresentations(null, {
        currentSource: "https://images.example.com/legacy.jpg",
        legacy: { wallpaperMask: 0.36 },
        legacyCompositions,
    });
    assertEquals(
        migratedFromLegacy["https://images.example.com/legacy.jpg"].readability,
        "quiet",
    );

    // 4. Data URLs: only valid data image URL matching currentSource is preserved
    const withDataUrls = {
        "data:image/png;base64,AAA": { ...DEFAULT_WALLPAPER_PRESENTATION },
        "data:image/png;base64,BBB": { ...DEFAULT_WALLPAPER_PRESENTATION },
        "data:text/html;base64,CCC": { ...DEFAULT_WALLPAPER_PRESENTATION },
        "__base__": { ...DEFAULT_WALLPAPER_PRESENTATION },
        "http://insecure.example.com/test.jpg": {
            ...DEFAULT_WALLPAPER_PRESENTATION,
        },
    };
    const filteredData = normalizeWallpaperPresentations(withDataUrls, {
        currentSource: "data:image/png;base64,AAA",
    });
    assertEquals(Boolean(filteredData["data:image/png;base64,AAA"]), true);
    assertEquals(Boolean(filteredData["data:image/png;base64,BBB"]), false);
    assertEquals(Boolean(filteredData["data:text/html;base64,CCC"]), false);
    assertEquals(Boolean(filteredData["__base__"]), false);
    assertEquals(
        Boolean(filteredData["http://insecure.example.com/test.jpg"]),
        false,
    );

    // 5. Retention: max 24 remote entries; current never evicted; uploaded excluded from quota
    const recordsToPrune: Record<string, WallpaperPresentation> = {};
    for (let i = 0; i < 30; i++) {
        recordsToPrune[`https://images.example.com/photo-${i}.jpg`] = {
            ...DEFAULT_WALLPAPER_PRESENTATION,
        };
    }
    // Also include uploaded wallpapers which must NOT count towards the 24 quota
    recordsToPrune["/api/wallpaper/11111111-1111-1111-1111-111111111111"] = {
        ...DEFAULT_WALLPAPER_PRESENTATION,
    };
    recordsToPrune["/api/wallpaper/22222222-2222-2222-2222-222222222222"] = {
        ...DEFAULT_WALLPAPER_PRESENTATION,
    };

    // photo-0 is currentSource so it must not be evicted even if it's oldest
    const pruned = normalizeWallpaperPresentations(recordsToPrune, {
        currentSource: "https://images.example.com/photo-0.jpg",
    });

    // Uploaded wallpapers must still exist
    assertEquals(
        Boolean(pruned["/api/wallpaper/11111111-1111-1111-1111-111111111111"]),
        true,
    );
    assertEquals(
        Boolean(pruned["/api/wallpaper/22222222-2222-2222-2222-222222222222"]),
        true,
    );
    // currentSource photo-0 must still exist
    assertEquals(
        Boolean(pruned["https://images.example.com/photo-0.jpg"]),
        true,
    );

    // Count remote entries remaining
    const remainingRemotes = Object.keys(pruned).filter((k) =>
        k.startsWith("https://")
    );
    assertEquals(remainingRemotes.length, MAX_REMOTE_PRESENTATIONS);
});

Deno.test("wallpaper-presentation: touchWallpaperPresentation and purgeWallpaperPresentation", () => {
    const records: Record<string, WallpaperPresentation> = {
        "https://example.com/a.jpg": { ...DEFAULT_WALLPAPER_PRESENTATION },
        "https://example.com/b.jpg": { ...DEFAULT_WALLPAPER_PRESENTATION },
    };

    // Touching a.jpg moves it to the end of iteration order
    touchWallpaperPresentation(records, "https://example.com/a.jpg");
    assertEquals(Object.keys(records), [
        "https://example.com/b.jpg",
        "https://example.com/a.jpg",
    ]);

    // Rejection of invalid / __base__ / http keys in touch helper
    touchWallpaperPresentation(records, "__base__");
    touchWallpaperPresentation(records, "http://insecure.com/evil.jpg");
    touchWallpaperPresentation(records, "data:text/html;base64,x");
    assertEquals(Object.keys(records), [
        "https://example.com/b.jpg",
        "https://example.com/a.jpg",
    ]);

    // Purging b.jpg removes it
    purgeWallpaperPresentation(records, "https://example.com/b.jpg");
    assertEquals(records["https://example.com/b.jpg"], undefined);
    assertEquals(Boolean(records["https://example.com/a.jpg"]), true);
});
