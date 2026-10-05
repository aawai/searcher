import { assertEquals, assertNotEquals } from "@std/assert";
import {
    calculateAmbientCompositeContribution,
    calculateWallpaperOverscan,
    DEFAULT_WALLPAPER_PRESENTATION,
    GLOBAL_MOTION_BUDGET,
    MAX_REMOTE_OR_GRADIENT_PRESENTATIONS,
    migrateLegacyWallpaperPresentation,
    normalizeWallpaperPresentation,
    normalizeWallpaperPresentations,
    purgeWallpaperPresentation,
    resolveWallpaperPresentation,
    touchWallpaperPresentation,
    WALLPAPER_AMBIENT_CANVAS_PARAMS,
    WALLPAPER_AMBIENT_IMAGE_PARAMS,
    WALLPAPER_AMBIENT_PARAMS,
    WALLPAPER_DRIFT_PARAMS,
    WALLPAPER_MOTION_TIMING,
    WALLPAPER_ZOOM_PARAMS,
    type WallpaperMotion,
    type WallpaperMotionLevel,
    type WallpaperPresentation,
    wallpaperPresentation,
    type WallpaperReadability,
    type WallpaperSoftness,
    type WallpaperSubstrate,
    type WallpaperTone,
} from "./wallpaper-presentation.ts";

Deno.test("wallpaper-presentation: resolveWallpaperPresentation resolves exact numeric values for all semantic stages", () => {
    // 1. Readability stages -> exact effective mask
    for (
        const [id, expectedMask] of [
            ["clear", 0.12],
            ["balanced", 0.24],
            ["quiet", 0.36],
            ["focus", 0.48],
        ] as const
    ) {
        assertEquals(
            resolveWallpaperPresentation(
                { ...DEFAULT_WALLPAPER_PRESENTATION, readability: id },
                { theme: "light", substrate: "image" },
            ).mask,
            expectedMask,
        );
    }

    // 2. Softness stages -> exact effective blur
    for (
        const [id, expectedBlur] of [
            ["none", 0],
            ["subtle", 2],
            ["soft", 5],
            ["hazy", 9],
        ] as const
    ) {
        assertEquals(
            resolveWallpaperPresentation(
                { ...DEFAULT_WALLPAPER_PRESENTATION, softness: id },
                { theme: "light", substrate: "image" },
            ).blur,
            expectedBlur,
        );
    }

    // 3. Tone stages -> exact filter and tone values across light and dark
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "natural" },
            { theme: "light", substrate: "image" },
        ).filter,
        "blur(0px) brightness(1) saturate(1) contrast(1) grayscale(0)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "natural" },
            { theme: "dark", substrate: "image" },
        ).filter,
        "blur(0px) brightness(1) saturate(1) contrast(1) grayscale(0)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "soft" },
            { theme: "light", substrate: "image" },
        ).filter,
        "blur(0px) brightness(0.99) saturate(0.86) contrast(0.96) grayscale(0)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "soft" },
            { theme: "dark", substrate: "image" },
        ).filter,
        "blur(0px) brightness(0.9) saturate(0.8) contrast(0.94) grayscale(0)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "mono" },
            { theme: "light", substrate: "image" },
        ).filter,
        "blur(0px) brightness(0.98) saturate(0) contrast(0.96) grayscale(1)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "mono" },
            { theme: "dark", substrate: "image" },
        ).filter,
        "blur(0px) brightness(0.86) saturate(0) contrast(0.92) grayscale(1)",
    );

    // 4. Ambient motion levels -> exact fieldAMix, fieldBMix, travel, scale, opacityFloor for canvas substrate
    for (
        const [level, exp] of [
            ["subtle", {
                fieldAMix: 4.0,
                fieldBMix: 3.2,
                travel: 3.0,
                scale: 1.012,
                opacityFloor: 0.92,
            }],
            ["soft", {
                fieldAMix: 5.5,
                fieldBMix: 4.4,
                travel: 4.8,
                scale: 1.020,
                opacityFloor: 0.89,
            }],
            ["standard", {
                fieldAMix: 7.0,
                fieldBMix: 5.6,
                travel: 7.0,
                scale: 1.030,
                opacityFloor: 0.86,
            }],
            ["pronounced", {
                fieldAMix: 8.5,
                fieldBMix: 6.8,
                travel: 9.5,
                scale: 1.040,
                opacityFloor: 0.82,
            }],
        ] as const
    ) {
        const res = resolveWallpaperPresentation(
            {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                motion: "ambient",
                motionLevel: level,
            },
            { theme: "light", substrate: "canvas" },
        );
        assertEquals(res.ambient.fieldAMix, exp.fieldAMix);
        assertEquals(res.ambient.fieldBMix, exp.fieldBMix);
        assertEquals(res.ambient.travel, exp.travel);
        assertEquals(res.ambient.scale, exp.scale);
        assertEquals(res.ambient.opacityFloor, exp.opacityFloor);
        assertEquals(res.ambient.neutral, false);
    }

    // 4b. Ambient motion levels -> exact fieldAMix, fieldBMix, travel, scale, opacityFloor for image substrate
    for (
        const [level, exp] of [
            ["subtle", {
                fieldAMix: 6.0,
                fieldBMix: 4.8,
                travel: 4.0,
                scale: 1.015,
                opacityFloor: 0.92,
            }],
            ["soft", {
                fieldAMix: 8.0,
                fieldBMix: 6.4,
                travel: 6.5,
                scale: 1.024,
                opacityFloor: 0.88,
            }],
            ["standard", {
                fieldAMix: 10.0,
                fieldBMix: 8.0,
                travel: 9.0,
                scale: 1.034,
                opacityFloor: 0.84,
            }],
            ["pronounced", {
                fieldAMix: 12.0,
                fieldBMix: 9.6,
                travel: 14.0,
                scale: 1.045,
                opacityFloor: 0.80,
            }],
        ] as const
    ) {
        const res = resolveWallpaperPresentation(
            {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                motion: "ambient",
                motionLevel: level,
            },
            { theme: "light", substrate: "image" },
        );
        assertEquals(res.ambient.fieldAMix, exp.fieldAMix);
        assertEquals(res.ambient.fieldBMix, exp.fieldBMix);
        assertEquals(res.ambient.travel, exp.travel);
        assertEquals(res.ambient.scale, exp.scale);
        assertEquals(res.ambient.opacityFloor, exp.opacityFloor);
        assertEquals(res.ambient.neutral, false);
    }

    // 4c. Gradient substrate ambient mapping uses same low-noise table as canvas
    for (const level of ["subtle", "soft", "standard", "pronounced"] as const) {
        const gradRes = resolveWallpaperPresentation(
            {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                motion: "ambient",
                motionLevel: level,
            },
            { theme: "light", substrate: "gradient" },
        );
        const canvasRes = resolveWallpaperPresentation(
            {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                motion: "ambient",
                motionLevel: level,
            },
            { theme: "light", substrate: "canvas" },
        );
        assertEquals(gradRes.ambient.fieldAMix, canvasRes.ambient.fieldAMix);
        assertEquals(gradRes.ambient.fieldBMix, canvasRes.ambient.fieldBMix);
        assertEquals(gradRes.ambient.travel, canvasRes.ambient.travel);
        assertEquals(gradRes.ambient.scale, canvasRes.ambient.scale);
        assertEquals(
            gradRes.ambient.opacityFloor,
            canvasRes.ambient.opacityFloor,
        );
    }
    // 4d. Verify substrate dictionary mappings
    assertEquals(
        WALLPAPER_AMBIENT_PARAMS.canvas,
        WALLPAPER_AMBIENT_CANVAS_PARAMS,
    );
    assertEquals(
        WALLPAPER_AMBIENT_PARAMS.gradient,
        WALLPAPER_AMBIENT_CANVAS_PARAMS,
    );
    assertEquals(
        WALLPAPER_AMBIENT_PARAMS.image,
        WALLPAPER_AMBIENT_IMAGE_PARAMS,
    );

    // 5. Drift motion levels -> exact x, y (stage scale removed)
    for (
        const [level, exp] of [
            ["subtle", { x: 0.40, y: 0.28 }],
            ["soft", { x: 0.75, y: 0.50 }],
            ["standard", { x: 1.15, y: 0.78 }],
            ["pronounced", { x: 1.60, y: 1.05 }],
        ] as const
    ) {
        const res = resolveWallpaperPresentation(
            {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                motion: "drift",
                motionLevel: level,
            },
            { theme: "light", substrate: "image" },
        );
        assertEquals(res.drift.x, exp.x);
        assertEquals(res.drift.y, exp.y);
    }

    // 6. Zoom motion levels -> exact scale
    for (
        const [level, expScale] of [
            ["subtle", 1.018],
            ["soft", 1.030],
            ["standard", 1.045],
            ["pronounced", 1.060],
        ] as const
    ) {
        const res = resolveWallpaperPresentation(
            {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                motion: "zoom",
                motionLevel: level,
            },
            { theme: "light", substrate: "image" },
        );
        assertEquals(res.zoom.scale, expScale);
    }
});

Deno.test("wallpaper-presentation: normalizeWallpaperPresentation handles valid and fallback inputs", () => {
    const valid: WallpaperPresentation = {
        composition: { focalX: 0.2, focalY: 0.8 },
        readability: "clear",
        softness: "hazy",
        tone: "mono",
        motion: "drift",
        motionLevel: "pronounced",
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
        softness: 123,
        tone: null,
        motion: "invalid",
        motionLevel: false,
    };
    assertEquals(normalizeWallpaperPresentation(malformed), {
        composition: { focalX: 0, focalY: 1 },
        readability: "balanced",
        softness: "none",
        tone: "natural",
        motion: "off",
        motionLevel: "soft",
    });
});

Deno.test("wallpaper-presentation: migrateLegacyWallpaperPresentation nearest visual mappings", () => {
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

    // 2. blur -> softness: <=1 none, <=3.5 subtle, <=7 soft, >7 hazy
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperBlur: 0 }).softness,
        "none",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperBlur: 1 }).softness,
        "none",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperBlur: 2 }).softness,
        "subtle",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperBlur: 3.5 }).softness,
        "subtle",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperBlur: 5 }).softness,
        "soft",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperBlur: 7 }).softness,
        "soft",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperBlur: 9 }).softness,
        "hazy",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperBlur: 15 }).softness,
        "hazy",
    );

    // Guest alias: blur
    assertEquals(
        migrateLegacyWallpaperPresentation({ blur: 2 }).softness,
        "subtle",
    );

    // 3. grayscale -> tone: <=0.15 natural, 0.15..0.70 soft, >0.70 mono
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperGrayscale: 0 }).tone,
        "natural",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperGrayscale: 0.15 }).tone,
        "natural",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperGrayscale: 0.16 }).tone,
        "soft",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperGrayscale: 0.50 }).tone,
        "soft",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperGrayscale: 0.70 }).tone,
        "soft",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperGrayscale: 0.71 }).tone,
        "mono",
    );
    assertEquals(
        migrateLegacyWallpaperPresentation({ wallpaperGrayscale: 1.0 }).tone,
        "mono",
    );

    // Guest alias: grayscale
    assertEquals(
        migrateLegacyWallpaperPresentation({ grayscale: 0.5 }).tone,
        "soft",
    );

    // 4. legacy motion:
    // explicit "off" stays "off" even if glow / strength are positive
    const explicitOff = migrateLegacyWallpaperPresentation({
        ambientMotionMode: "off",
        ambientMotionStrength: 0.8,
        wallpaperGlowStrength: 0.2,
    });
    assertEquals(explicitOff.motion, "off");

    // active motion modes "breathe" and "breathe_ripple" migrate to "ambient"
    const breathe = migrateLegacyWallpaperPresentation({
        ambientMotionMode: "breathe",
        ambientMotionStrength: 0.35,
    });
    assertEquals(breathe.motion, "ambient");
    assertEquals(breathe.motionLevel, "soft");

    const breatheRipple = migrateLegacyWallpaperPresentation({
        ambientMotionMode: "breathe_ripple",
        ambientMotionStrength: 0.7,
    });
    assertEquals(breatheRipple.motion, "ambient");
    assertEquals(breatheRipple.motionLevel, "pronounced");

    // positive legacy glow triggers ambient when mode is not off
    const positiveGlow = migrateLegacyWallpaperPresentation({
        wallpaperGlowStrength: 0.14,
    });
    assertEquals(positiveGlow.motion, "ambient");
    assertEquals(positiveGlow.motionLevel, "soft"); // glow * 2.5 = 0.35 -> soft

    // zero contribution migrates to "off"
    const zeroContrib = migrateLegacyWallpaperPresentation({
        ambientMotionStrength: 0,
        wallpaperGlowStrength: 0,
    });
    assertEquals(zeroContrib.motion, "off");

    // 5. Source-specific composition passed via raw.composition
    const withComp = migrateLegacyWallpaperPresentation({
        composition: { focalX: 0.25, focalY: 0.75 },
    });
    assertEquals(withComp.composition, { focalX: 0.25, focalY: 0.75 });
});

Deno.test("wallpaper-presentation: migration idempotence", () => {
    const raw = {
        wallpaperMask: 0.36,
        wallpaperBlur: 5,
        wallpaperGrayscale: 0.5,
        ambientMotionMode: "breathe",
        ambientMotionStrength: 0.35,
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
            softness: "soft",
            tone: "soft",
            motion: "drift",
            motionLevel: "standard",
        },
        "linear-gradient(to right, red, blue)": {
            composition: { focalX: 0.2, focalY: 0.8 },
            readability: "focus",
            softness: "hazy",
            tone: "mono",
            motion: "ambient",
            motionLevel: "pronounced",
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

    // 3. Gradient source always centers focal composition
    const resolvedGradient = wallpaperPresentation(
        "linear-gradient(to right, red, blue)",
        records,
    );
    assertEquals(resolvedGradient.composition, { focalX: 0.5, focalY: 0.5 });
    assertEquals(resolvedGradient.readability, "focus");

    // 4. Unrecorded gradient defaults to canonical presentation with center focal point
    const unrecordedGradient = wallpaperPresentation(
        "linear-gradient(to bottom, #111, #222)",
        records,
    );
    assertEquals(unrecordedGradient, {
        ...DEFAULT_WALLPAPER_PRESENTATION,
        composition: { focalX: 0.5, focalY: 0.5 },
    });

    // 5. Unrecorded remote source returns canonical defaults
    const unrecordedRemote = wallpaperPresentation(
        "https://example.com/unrecorded.jpg",
        records,
    );
    assertEquals(unrecordedRemote, DEFAULT_WALLPAPER_PRESENTATION);

    // 6. Rejection of __base__, insecure http, and invalid data URLs
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
            softness: "subtle",
            tone: "natural",
            motion: "ambient",
            motionLevel: "subtle",
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
        legacy: {
            wallpaperMask: 0.36,
            wallpaperBlur: 2,
            ambientMotionMode: "breathe",
        },
        legacyCompositions,
    });
    assertEquals(
        migratedFromLegacy["https://images.example.com/legacy.jpg"].readability,
        "quiet",
    );
    assertEquals(
        migratedFromLegacy["https://images.example.com/legacy.jpg"].softness,
        "subtle",
    );
    assertEquals(
        migratedFromLegacy["https://images.example.com/legacy.jpg"].motion,
        "ambient",
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

    // 5. Retention: max 24 remote / gradient entries; current never evicted; uploaded excluded from quota
    // 4. Retention: max 24 remote / gradient entries; current never evicted; uploaded excluded from quota
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
    assertEquals(remainingRemotes.length, MAX_REMOTE_OR_GRADIENT_PRESENTATIONS);
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

Deno.test("wallpaper-presentation: resolveWallpaperPresentation output and theme handling", () => {
    // 1. Fixed filter order: blur brightness saturate contrast grayscale
    const lightResolved = resolveWallpaperPresentation(
        {
            composition: { focalX: 0.5, focalY: 0.5 },
            readability: "balanced",
            softness: "subtle",
            tone: "soft",
            motion: "off",
            motionLevel: "soft",
        },
        { theme: "light", substrate: "image" },
    );
    assertEquals(lightResolved.blur, 2);
    assertEquals(lightResolved.mask, 0.24);
    assertEquals(
        lightResolved.filter,
        "blur(2px) brightness(0.99) saturate(0.86) contrast(0.96) grayscale(0)",
    );

    const darkResolved = resolveWallpaperPresentation(
        {
            composition: { focalX: 0.5, focalY: 0.5 },
            readability: "balanced",
            softness: "subtle",
            tone: "soft",
            motion: "off",
            motionLevel: "soft",
        },
        { theme: "dark", substrate: "image" },
    );
    assertEquals(
        darkResolved.filter,
        "blur(2px) brightness(0.9) saturate(0.8) contrast(0.94) grayscale(0)",
    );

    // Mono tone
    const monoResolved = resolveWallpaperPresentation(
        {
            composition: { focalX: 0.5, focalY: 0.5 },
            readability: "clear",
            softness: "none",
            tone: "mono",
            motion: "off",
            motionLevel: "soft",
        },
        { theme: "light", substrate: "image" },
    );
    assertEquals(
        monoResolved.filter,
        "blur(0px) brightness(0.98) saturate(0) contrast(0.96) grayscale(1)",
    );
});

Deno.test("wallpaper-presentation: resolveWallpaperPresentation Tone x Ambient composition rules", () => {
    // 1. Image substrate:
    // tone = natural: full mix
    const naturalAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            tone: "natural",
            motion: "ambient",
            motionLevel: "pronounced",
        },
        { theme: "light", substrate: "image" },
    );
    assertEquals(naturalAmbient.ambient.fieldAMix, 12.0);
    assertEquals(naturalAmbient.ambient.fieldBMix, 9.6);
    assertEquals(naturalAmbient.ambient.neutral, false);

    // tone = soft: 90% factor
    const softAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            tone: "soft",
            motion: "ambient",
            motionLevel: "pronounced",
        },
        { theme: "light", substrate: "image" },
    );
    assertEquals(softAmbient.ambient.fieldAMix, 10.8);
    assertEquals(softAmbient.ambient.fieldBMix, 8.64);
    assertEquals(softAmbient.ambient.neutral, false);

    // tone = mono: retains stage luminance mix so neutral field is visible, neutral = true
    const monoAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            tone: "mono",
            motion: "ambient",
            motionLevel: "pronounced",
        },
        { theme: "light", substrate: "image" },
    );
    assertEquals(monoAmbient.ambient.fieldAMix, 12.0);
    assertEquals(monoAmbient.ambient.fieldBMix, 9.6);
    assertEquals(monoAmbient.ambient.neutral, true);

    // 2. Canvas substrate with soft tone (90% factor on canvas table)
    const softCanvas = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            tone: "soft",
            motion: "ambient",
            motionLevel: "pronounced",
        },
        { theme: "light", substrate: "canvas" },
    );
    assertEquals(softCanvas.ambient.fieldAMix, Number((8.5 * 0.9).toFixed(3)));
    assertEquals(softCanvas.ambient.fieldBMix, Number((6.8 * 0.9).toFixed(3)));
    assertEquals(softCanvas.ambient.neutral, false);
});

Deno.test("wallpaper-presentation: resolveWallpaperPresentation substrate behavior", () => {
    // 1. Canvas substrate:
    // Ambient is allowed on canvas
    const canvasAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "ambient",
            motionLevel: "standard",
        },
        { theme: "light", substrate: "canvas" },
    );
    assertEquals(canvasAmbient.motion, "ambient");
    assertEquals(canvasAmbient.ambient.fieldAMix, 7.0);
    assertEquals(canvasAmbient.ambient.fieldBMix, 5.6);
    assertEquals(canvasAmbient.mask, 0);
    assertEquals(canvasAmbient.blur, 0);
    assertEquals(
        canvasAmbient.filter,
        "blur(0px) brightness(1) saturate(1) contrast(1) grayscale(0)",
    );
    assertEquals(canvasAmbient.composition, { focalX: 0.5, focalY: 0.5 });

    // Drift downgrades to "off" on canvas
    const canvasDrift = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "drift",
            motionLevel: "standard",
        },
        { theme: "light", substrate: "canvas" },
    );
    assertEquals(canvasDrift.motion, "off");
    assertEquals(canvasDrift.drift.x, 0);
    assertEquals(canvasDrift.drift.y, 0);

    // Zoom downgrades to "off" on canvas
    const canvasZoom = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "zoom",
            motionLevel: "standard",
        },
        { theme: "light", substrate: "canvas" },
    );
    assertEquals(canvasZoom.motion, "off");
    assertEquals(canvasZoom.zoom.scale, 1);

    // 2. Gradient substrate:
    // Ambient uses low-noise table (same as canvas)
    const gradientAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "ambient",
            motionLevel: "standard",
            readability: "balanced",
            softness: "subtle",
        },
        { theme: "light", substrate: "gradient" },
    );
    assertEquals(gradientAmbient.ambient.fieldAMix, 7.0);
    assertEquals(gradientAmbient.ambient.fieldBMix, 5.6);
    assertEquals(gradientAmbient.mask, 0.24);
    assertEquals(gradientAmbient.blur, 2);

    // Drift is allowed on gradient
    const gradientDrift = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "drift",
            motionLevel: "standard",
        },
        { theme: "light", substrate: "gradient" },
    );
    assertEquals(gradientDrift.motion, "drift");
    assertEquals(gradientDrift.drift.x, 1.15);
    assertEquals(gradientDrift.drift.y, 0.78);

    // Zoom is allowed on gradient
    const gradientZoom = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "zoom",
            motionLevel: "standard",
        },
        { theme: "light", substrate: "gradient" },
    );
    assertEquals(gradientZoom.motion, "zoom");
    assertEquals(gradientZoom.zoom.scale, 1.045);
});

Deno.test("wallpaper-presentation: resolveWallpaperPresentation reducedMotion behavior", () => {
    // Drift downgrades to "off"
    const reducedDrift = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "drift",
            motionLevel: "pronounced",
        },
        { theme: "light", substrate: "image", reducedMotion: true },
    );
    assertEquals(reducedDrift.motion, "off");
    assertEquals(reducedDrift.drift.x, 0);
    assertEquals(reducedDrift.drift.y, 0);

    // Zoom downgrades to "off"
    const reducedZoom = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "zoom",
            motionLevel: "pronounced",
        },
        { theme: "light", substrate: "image", reducedMotion: true },
    );
    assertEquals(reducedZoom.motion, "off");
    assertEquals(reducedZoom.zoom.scale, 1);

    // Ambient retains static field (travel: 0, scale: 1, floor preserved)
    const reducedAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "ambient",
            motionLevel: "pronounced",
        },
        { theme: "light", substrate: "image", reducedMotion: true },
    );
    assertEquals(reducedAmbient.motion, "ambient");
    assertEquals(reducedAmbient.ambient.travel, 0);
    assertEquals(reducedAmbient.ambient.scale, 1);
    assertEquals(reducedAmbient.ambient.opacityFloor, 0.80);
    assertEquals(reducedAmbient.ambient.fieldAMix, 12.0);
    assertEquals(reducedAmbient.ambient.fieldBMix, 9.6);
});

Deno.test("wallpaper-presentation: calculateWallpaperOverscan drift and zoom derivations", () => {
    // Drift: tx = 0.016, ty = 0.0105 at pronounced
    const driftOverscan = calculateWallpaperOverscan({
        blur: 5,
        motion: "drift",
        motionLevel: "pronounced",
    });
    const tx = 1.60 / 100;
    const ty = 1.05 / 100;
    const denomX = 1 - 2 * tx;
    const denomY = 1 - 2 * ty;
    assertEquals(driftOverscan.percentageX, (100 * tx) / denomX);
    assertEquals(driftOverscan.percentageY, (100 * ty) / denomY);
    assertEquals(driftOverscan.pixelsX, (3 * 5) / denomX);
    assertEquals(driftOverscan.pixelsY, (3 * 5) / denomY);
    assertEquals(driftOverscan.scale, Math.max(1 / denomX, 1 / denomY));

    // Zoom: peak scale 1.060 at pronounced
    const zoomOverscan = calculateWallpaperOverscan({
        blur: 9,
        motion: "zoom",
        motionLevel: "pronounced",
    });
    assertEquals(zoomOverscan.percentageX, 100 * (1.060 - 1));
    assertEquals(zoomOverscan.pixelsX, 3 * 9 * 1.060);
    assertEquals(zoomOverscan.scale, 1.060);

    // Off: 0 percentage, 3 * blur pixels
    const offOverscan = calculateWallpaperOverscan({ blur: 2, motion: "off" });
    assertEquals(offOverscan.percentageX, 0);
    assertEquals(offOverscan.pixelsX, 6);
    assertEquals(offOverscan.scale, 1);
});

Deno.test("wallpaper-presentation: exhaustive matrix satisfies Global Motion Budget v2 invariants", () => {
    const readabilities: WallpaperReadability[] = [
        "clear",
        "balanced",
        "quiet",
        "focus",
    ];
    const softnesses: WallpaperSoftness[] = ["none", "subtle", "soft", "hazy"];
    const tones: WallpaperTone[] = ["natural", "soft", "mono"];
    const motions: WallpaperMotion[] = ["off", "ambient", "drift", "zoom"];
    const motionLevels: WallpaperMotionLevel[] = [
        "subtle",
        "soft",
        "standard",
        "pronounced",
    ];
    const substrates: WallpaperSubstrate[] = ["canvas", "gradient", "image"];
    const themes: ("light" | "dark")[] = ["light", "dark"];

    let count = 0;
    for (const readability of readabilities) {
        for (const softness of softnesses) {
            for (const tone of tones) {
                for (const motion of motions) {
                    for (const motionLevel of motionLevels) {
                        for (const substrate of substrates) {
                            for (const theme of themes) {
                                count++;
                                const presentation: WallpaperPresentation = {
                                    composition: { focalX: 0.5, focalY: 0.5 },
                                    readability,
                                    softness,
                                    tone,
                                    motion,
                                    motionLevel,
                                };
                                const resolved = resolveWallpaperPresentation(
                                    presentation,
                                    {
                                        theme,
                                        substrate,
                                    },
                                );

                                // 1. Invariant: Finite numbers, no NaN
                                assertEquals(
                                    Number.isFinite(resolved.mask),
                                    true,
                                );
                                assertEquals(
                                    Number.isFinite(resolved.blur),
                                    true,
                                );
                                assertEquals(
                                    Number.isFinite(resolved.ambient.fieldAMix),
                                    true,
                                );
                                assertEquals(
                                    Number.isFinite(resolved.ambient.fieldBMix),
                                    true,
                                );
                                assertEquals(
                                    Number.isFinite(resolved.ambient.travel),
                                    true,
                                );
                                assertEquals(
                                    Number.isFinite(resolved.ambient.scale),
                                    true,
                                );
                                assertEquals(
                                    Number.isFinite(
                                        resolved.ambient.opacityFloor,
                                    ),
                                    true,
                                );
                                assertEquals(
                                    Number.isFinite(resolved.drift.x),
                                    true,
                                );
                                assertEquals(
                                    Number.isFinite(resolved.drift.y),
                                    true,
                                );
                                assertEquals(
                                    Number.isFinite(resolved.zoom.scale),
                                    true,
                                );

                                // 2. Invariant: Valid CSS filter syntax
                                assertNotEquals(resolved.filter.length, 0);
                                assertEquals(
                                    resolved.filter.includes("NaN"),
                                    false,
                                );
                                assertEquals(
                                    resolved.filter.includes("undefined"),
                                    false,
                                );

                                // 3. Motion budget v2 invariants:
                                // - Field raw mix upper bounds
                                assertEquals(
                                    resolved.ambient.fieldAMix <=
                                        GLOBAL_MOTION_BUDGET
                                            .maxAmbientFieldARawMixPercent,
                                    true,
                                );
                                assertEquals(
                                    resolved.ambient.fieldBMix <=
                                        GLOBAL_MOTION_BUDGET
                                            .maxAmbientFieldBRawMixPercent,
                                    true,
                                );

                                // - Drift movement bounds
                                assertEquals(
                                    resolved.drift.x <=
                                        GLOBAL_MOTION_BUDGET
                                            .maxDriftMovementXPercent,
                                    true,
                                );
                                assertEquals(
                                    resolved.drift.y <=
                                        GLOBAL_MOTION_BUDGET
                                            .maxDriftMovementYPercent,
                                    true,
                                );

                                // - Zoom delta <= 6%
                                assertEquals(
                                    resolved.zoom.scale - 1 <=
                                        GLOBAL_MOTION_BUDGET
                                                        .maxZoomDeltaPercent /
                                                    100 + 0.0001,
                                    true,
                                );

                                // - Conservative composite peak calculation
                                const contrib =
                                    calculateAmbientCompositeContribution({
                                        fieldAMix: resolved.ambient.fieldAMix,
                                        fieldBMix: resolved.ambient.fieldBMix,
                                        mask: resolved.mask,
                                    });
                                assertEquals(
                                    contrib.composited <=
                                        GLOBAL_MOTION_BUDGET
                                                .maxAmbientCompositeContribution +
                                            0.0001,
                                    true,
                                );

                                // - After clear mask (mask = 0.12) contribution upper bound
                                if (
                                    readability === "clear" &&
                                    substrate !== "canvas"
                                ) {
                                    assertEquals(
                                        contrib.afterMask <=
                                            GLOBAL_MOTION_BUDGET
                                                    .maxAmbientCompositeContributionAfterClear +
                                                0.0001,
                                        true,
                                    );
                                }

                                // - Canvas (no mask) also <= composite limit
                                if (substrate === "canvas") {
                                    assertEquals(
                                        contrib.composited <=
                                            GLOBAL_MOTION_BUDGET
                                                    .maxAmbientCompositeContribution +
                                                0.0001,
                                        true,
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    // 4 * 4 * 3 * 4 * 4 * 3 * 2 = 4608 permutations checked
    assertEquals(count, 4608);

    // Timing invariants
    assertEquals(
        WALLPAPER_MOTION_TIMING.ambient.durationA >=
            GLOBAL_MOTION_BUDGET.minAmbientDurationSeconds,
        true,
    );
    assertEquals(
        WALLPAPER_MOTION_TIMING.ambient.durationB >=
            GLOBAL_MOTION_BUDGET.minAmbientDurationSeconds,
        true,
    );
    assertEquals(
        WALLPAPER_MOTION_TIMING.drift.duration >=
            GLOBAL_MOTION_BUDGET.minDriftZoomDurationSeconds,
        true,
    );
    assertEquals(
        WALLPAPER_MOTION_TIMING.zoom.duration >=
            GLOBAL_MOTION_BUDGET.minDriftZoomDurationSeconds,
        true,
    );
    assertEquals(
        WALLPAPER_MOTION_TIMING.ambient.layerCount <=
            GLOBAL_MOTION_BUDGET.maxMovingAmbientFields,
        true,
    );
});

Deno.test("wallpaper-presentation: stage monotonicity across all stages", () => {
    const levels: WallpaperMotionLevel[] = [
        "subtle",
        "soft",
        "standard",
        "pronounced",
    ];
    for (let i = 0; i < levels.length - 1; i++) {
        const curr = levels[i];
        const next = levels[i + 1];

        // Canvas ambient monotonicity
        const cCurr = WALLPAPER_AMBIENT_CANVAS_PARAMS[curr];
        const cNext = WALLPAPER_AMBIENT_CANVAS_PARAMS[next];
        assertEquals(cNext.fieldAMix > cCurr.fieldAMix, true);
        assertEquals(cNext.fieldBMix > cCurr.fieldBMix, true);
        assertEquals(cNext.travel > cCurr.travel, true);
        assertEquals(cNext.scale > cCurr.scale, true);
        assertEquals(cNext.opacityFloor <= cCurr.opacityFloor, true);

        // Image ambient monotonicity
        const iCurr = WALLPAPER_AMBIENT_IMAGE_PARAMS[curr];
        const iNext = WALLPAPER_AMBIENT_IMAGE_PARAMS[next];
        assertEquals(iNext.fieldAMix > iCurr.fieldAMix, true);
        assertEquals(iNext.fieldBMix > iCurr.fieldBMix, true);
        assertEquals(iNext.travel > iCurr.travel, true);
        assertEquals(iNext.scale > iCurr.scale, true);
        assertEquals(iNext.opacityFloor <= iCurr.opacityFloor, true);

        // Drift monotonicity
        const dCurr = WALLPAPER_DRIFT_PARAMS[curr];
        const dNext = WALLPAPER_DRIFT_PARAMS[next];
        assertEquals(dNext.x > dCurr.x, true);
        assertEquals(dNext.y > dCurr.y, true);

        // Zoom monotonicity
        const zCurr = WALLPAPER_ZOOM_PARAMS[curr];
        const zNext = WALLPAPER_ZOOM_PARAMS[next];
        assertEquals(zNext.scale > zCurr.scale, true);
    }
});

Deno.test("wallpaper-presentation: ambient envelopes never extinguish a field", () => {
    for (const level of ["subtle", "soft", "standard", "pronounced"] as const) {
        assertEquals(
            WALLPAPER_AMBIENT_CANVAS_PARAMS[level].opacityFloor >= 0.80,
            true,
        );
        assertEquals(
            WALLPAPER_AMBIENT_IMAGE_PARAMS[level].opacityFloor >= 0.80,
            true,
        );
    }
});
