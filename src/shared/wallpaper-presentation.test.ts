import { assertEquals, assertNotEquals } from "@std/assert";
import {
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
    WALLPAPER_MOTION_TIMING,
    type WallpaperMotion,
    type WallpaperMotionLevel,
    type WallpaperPresentation,
    wallpaperPresentation,
    type WallpaperReadability,
    type WallpaperSoftness,
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
                { theme: "light" },
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
                { theme: "light" },
            ).blur,
            expectedBlur,
        );
    }

    // 3. Tone stages -> exact filter and tone values across light and dark
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "natural" },
            { theme: "light" },
        ).filter,
        "blur(0px) brightness(1) saturate(1) contrast(1) grayscale(0)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "natural" },
            { theme: "dark" },
        ).filter,
        "blur(0px) brightness(1) saturate(1) contrast(1) grayscale(0)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "soft" },
            { theme: "light" },
        ).filter,
        "blur(0px) brightness(0.99) saturate(0.86) contrast(0.96) grayscale(0)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "soft" },
            { theme: "dark" },
        ).filter,
        "blur(0px) brightness(0.9) saturate(0.8) contrast(0.94) grayscale(0)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "mono" },
            { theme: "light" },
        ).filter,
        "blur(0px) brightness(0.98) saturate(0) contrast(0.96) grayscale(1)",
    );
    assertEquals(
        resolveWallpaperPresentation(
            { ...DEFAULT_WALLPAPER_PRESENTATION, tone: "mono" },
            { theme: "dark" },
        ).filter,
        "blur(0px) brightness(0.86) saturate(0) contrast(0.92) grayscale(1)",
    );

    // 4. Ambient motion levels -> exact mix, travel, scale
    for (
        const [level, exp] of [
            ["subtle", { mix: 3.5, travel: 1.2, scale: 1.010 }],
            ["soft", { mix: 5.0, travel: 1.8, scale: 1.016 }],
            ["standard", { mix: 6.5, travel: 2.4, scale: 1.022 }],
            ["pronounced", { mix: 8.0, travel: 3.2, scale: 1.028 }],
        ] as const
    ) {
        const res = resolveWallpaperPresentation(
            {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                motion: "ambient",
                motionLevel: level,
            },
            { theme: "light" },
        );
        assertEquals(res.ambient.mix, exp.mix);
        assertEquals(res.ambient.travel, exp.travel);
        assertEquals(res.ambient.scale, exp.scale);
        assertEquals(res.ambient.fieldMix, Number((exp.mix / 2).toFixed(3)));
    }

    // 5. Drift motion levels -> exact x, y, scale
    for (
        const [level, exp] of [
            ["subtle", { x: 0.25, y: 0.18, scale: 1.012 }],
            ["soft", { x: 0.45, y: 0.30, scale: 1.017 }],
            ["standard", { x: 0.65, y: 0.45, scale: 1.023 }],
            ["pronounced", { x: 0.90, y: 0.60, scale: 1.032 }],
        ] as const
    ) {
        const res = resolveWallpaperPresentation(
            {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                motion: "drift",
                motionLevel: level,
            },
            { theme: "light" },
        );
        assertEquals(res.drift.x, exp.x);
        assertEquals(res.drift.y, exp.y);
        assertEquals(res.drift.scale, exp.scale);
    }

    // 6. Zoom motion levels -> exact scale
    for (
        const [level, expScale] of [
            ["subtle", 1.012],
            ["soft", 1.020],
            ["standard", 1.028],
            ["pronounced", 1.040],
        ] as const
    ) {
        const res = resolveWallpaperPresentation(
            {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                motion: "zoom",
                motionLevel: level,
            },
            { theme: "light" },
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
        { theme: "light" },
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
        { theme: "dark" },
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
        { theme: "light" },
    );
    assertEquals(
        monoResolved.filter,
        "blur(0px) brightness(0.98) saturate(0) contrast(0.96) grayscale(1)",
    );
});

Deno.test("wallpaper-presentation: resolveWallpaperPresentation Tone x Ambient composition rules", () => {
    // tone = natural: full accent mix
    const naturalAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            tone: "natural",
            motion: "ambient",
            motionLevel: "pronounced",
        },
        { theme: "light" },
    );
    assertEquals(naturalAmbient.ambient.mix, 8.0);
    assertEquals(naturalAmbient.ambient.fieldMix, 4.0);
    assertEquals(naturalAmbient.ambient.neutral, false);

    // tone = soft: 85% accent mix
    const softAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            tone: "soft",
            motion: "ambient",
            motionLevel: "pronounced",
        },
        { theme: "light" },
    );
    assertEquals(softAmbient.ambient.mix, Number((8.0 * 0.85).toFixed(3)));
    assertEquals(
        softAmbient.ambient.fieldMix,
        Number((softAmbient.ambient.mix / 2).toFixed(3)),
    );
    assertEquals(softAmbient.ambient.neutral, false);

    // tone = mono: retains stage luminance mix so neutral field is visible, neutral = true
    const monoAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            tone: "mono",
            motion: "ambient",
            motionLevel: "pronounced",
        },
        { theme: "light" },
    );
    assertEquals(monoAmbient.ambient.mix, 8.0);
    assertEquals(monoAmbient.ambient.fieldMix, 4.0);
    assertEquals(monoAmbient.ambient.neutral, true);
});

Deno.test("wallpaper-presentation: resolveWallpaperPresentation hasWallpaper=false behavior", () => {
    // Ambient is allowed when hasWallpaper is false
    const noWallpaperAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "ambient",
            motionLevel: "standard",
        },
        { theme: "light", hasWallpaper: false },
    );
    assertEquals(noWallpaperAmbient.motion, "ambient");
    assertEquals(noWallpaperAmbient.ambient.mix, 6.5);
    assertEquals(noWallpaperAmbient.mask, 0);
    assertEquals(noWallpaperAmbient.blur, 0);
    assertEquals(
        noWallpaperAmbient.filter,
        "blur(0px) brightness(1) saturate(1) contrast(1) grayscale(0)",
    );
    assertEquals(noWallpaperAmbient.composition, { focalX: 0.5, focalY: 0.5 });

    // Drift downgrades to "off" when hasWallpaper is false
    const noWallpaperDrift = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "drift",
            motionLevel: "standard",
        },
        { theme: "light", hasWallpaper: false },
    );
    assertEquals(noWallpaperDrift.motion, "off");

    // Zoom downgrades to "off" when hasWallpaper is false
    const noWallpaperZoom = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "zoom",
            motionLevel: "standard",
        },
        { theme: "light", hasWallpaper: false },
    );
    assertEquals(noWallpaperZoom.motion, "off");
});

Deno.test("wallpaper-presentation: resolveWallpaperPresentation reducedMotion behavior", () => {
    // Drift downgrades to "off"
    const reducedDrift = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "drift",
            motionLevel: "pronounced",
        },
        { theme: "light", reducedMotion: true },
    );
    assertEquals(reducedDrift.motion, "off");

    // Zoom downgrades to "off"
    const reducedZoom = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "zoom",
            motionLevel: "pronounced",
        },
        { theme: "light", reducedMotion: true },
    );
    assertEquals(reducedZoom.motion, "off");

    // Ambient retains static field (travel: 0, scale: 1)
    const reducedAmbient = resolveWallpaperPresentation(
        {
            ...DEFAULT_WALLPAPER_PRESENTATION,
            motion: "ambient",
            motionLevel: "pronounced",
        },
        { theme: "light", reducedMotion: true },
    );
    assertEquals(reducedAmbient.motion, "ambient");
    assertEquals(reducedAmbient.ambient.travel, 0);
    assertEquals(reducedAmbient.ambient.scale, 1);
    assertEquals(reducedAmbient.ambient.mix, 8.0);
});

Deno.test("wallpaper-presentation: calculateWallpaperOverscan drift and zoom derivations", () => {
    // Drift: tx = 0.009, ty = 0.006 at pronounced
    const driftOverscan = calculateWallpaperOverscan({
        blur: 5,
        motion: "drift",
        motionLevel: "pronounced",
    });
    const tx = 0.90 / 100;
    assertEquals(driftOverscan.percentageX, (100 * tx) / (1 - 2 * tx));
    assertEquals(driftOverscan.pixelsX, (3 * 5 * 1.032) / (1 - 2 * tx));
    assertEquals(driftOverscan.scale, 1.032);

    // Zoom: peak scale 1.040 at pronounced
    const zoomOverscan = calculateWallpaperOverscan({
        blur: 9,
        motion: "zoom",
        motionLevel: "pronounced",
    });
    assertEquals(zoomOverscan.percentageX, 100 * (1.040 - 1));
    assertEquals(zoomOverscan.pixelsX, 3 * 9 * 1.04);
    assertEquals(zoomOverscan.scale, 1.040);

    // Off: 0 percentage, 3 * blur pixels
    const offOverscan = calculateWallpaperOverscan({ blur: 2, motion: "off" });
    assertEquals(offOverscan.percentageX, 0);
    assertEquals(offOverscan.pixelsX, 6);
    assertEquals(offOverscan.scale, 1);
});

Deno.test("wallpaper-presentation: exhaustive matrix satisfies Global Motion Budget invariants", () => {
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
    const themes: ("light" | "dark")[] = ["light", "dark"];

    let count = 0;
    for (const readability of readabilities) {
        for (const softness of softnesses) {
            for (const tone of tones) {
                for (const motion of motions) {
                    for (const motionLevel of motionLevels) {
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
                                },
                            );

                            // 1. Invariant: Finite numbers, no NaN
                            assertEquals(Number.isFinite(resolved.mask), true);
                            assertEquals(Number.isFinite(resolved.blur), true);
                            assertEquals(
                                Number.isFinite(resolved.ambient.mix),
                                true,
                            );
                            assertEquals(
                                Number.isFinite(resolved.ambient.fieldMix),
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
                                Number.isFinite(resolved.drift.x),
                                true,
                            );
                            assertEquals(
                                Number.isFinite(resolved.drift.y),
                                true,
                            );
                            assertEquals(
                                Number.isFinite(resolved.drift.scale),
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

                            // 3. Motion budget invariants:
                            // - Accent contribution <= 8%
                            assertEquals(
                                resolved.ambient.mix <=
                                    GLOBAL_MOTION_BUDGET
                                        .maxAccentContributionPercent,
                                true,
                            );
                            // - Two overlapping fields: each field <= mix/2 <= 4%
                            assertEquals(
                                resolved.ambient.fieldMix <= 4.0,
                                true,
                            );
                            // - Drift movement <= 1%
                            assertEquals(
                                resolved.drift.x <=
                                    GLOBAL_MOTION_BUDGET.maxMovementPercent,
                                true,
                            );
                            assertEquals(
                                resolved.drift.y <=
                                    GLOBAL_MOTION_BUDGET.maxMovementPercent,
                                true,
                            );
                            // - Zoom delta <= 4%
                            assertEquals(
                                resolved.zoom.scale - 1 <=
                                    GLOBAL_MOTION_BUDGET.maxZoomDeltaPercent /
                                                100 + 0.0001,
                                true,
                            );
                        }
                    }
                }
            }
        }
    }
    // 4 * 4 * 3 * 4 * 4 * 2 = 1536 permutations checked
    assertEquals(count, 1536);

    // Timing invariants
    assertEquals(
        WALLPAPER_MOTION_TIMING.ambient.durationA >=
            GLOBAL_MOTION_BUDGET.minDurationSeconds,
        true,
    );
    assertEquals(
        WALLPAPER_MOTION_TIMING.ambient.durationB >=
            GLOBAL_MOTION_BUDGET.minDurationSeconds,
        true,
    );
    assertEquals(
        WALLPAPER_MOTION_TIMING.drift.duration >=
            GLOBAL_MOTION_BUDGET.minDurationSeconds,
        true,
    );
    assertEquals(
        WALLPAPER_MOTION_TIMING.zoom.duration >=
            GLOBAL_MOTION_BUDGET.minDurationSeconds,
        true,
    );
    assertEquals(
        WALLPAPER_MOTION_TIMING.ambient.layerCount <=
            GLOBAL_MOTION_BUDGET.maxMovingAmbientFields,
        true,
    );
});
