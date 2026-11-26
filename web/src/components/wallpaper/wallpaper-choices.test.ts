import { assertEquals } from "@std/assert";
import { DEFAULT_WALLPAPER_PRESENTATION } from "@shared/wallpaper-presentation.ts";
import {
    buildDarkWallpaperSelectionPatch,
    buildWallpaperHistoryItems,
    buildWallpaperSelectionPatch,
    DARK_WALLPAPER_MODE_CHOICES,
    resolveEffectiveWallpaper,
    type WallpaperHistoryRecord,
} from "./wallpaper-choices.ts";

Deno.test("buildWallpaperHistoryItems: handles empty, <=5, >5, and unrecorded current wallpaper", () => {
    assertEquals(buildWallpaperHistoryItems("", []), []);

    const three: WallpaperHistoryRecord[] = [
        { id: "1", url: "/api/wallpaper/1" },
        { id: "2", url: "/api/wallpaper/2" },
        { id: "3", url: "/api/wallpaper/3" },
    ];
    assertEquals(buildWallpaperHistoryItems("", three), three);
    assertEquals(
        buildWallpaperHistoryItems("/api/wallpaper/2", three),
        three,
    );

    const six: WallpaperHistoryRecord[] = [
        { id: "1", url: "/api/wallpaper/1" },
        { id: "2", url: "/api/wallpaper/2" },
        { id: "3", url: "/api/wallpaper/3" },
        { id: "4", url: "/api/wallpaper/4" },
        { id: "5", url: "/api/wallpaper/5" },
        { id: "6", url: "/api/wallpaper/6" },
    ];
    assertEquals(buildWallpaperHistoryItems("", six).length, 5);
    assertEquals(
        buildWallpaperHistoryItems("https://example.com/bg.jpg", six),
        [
            { id: "current", url: "https://example.com/bg.jpg" },
            six[0],
            six[1],
            six[2],
            six[3],
        ],
    );

    assertEquals(
        buildWallpaperHistoryItems("data:image/png;base64,abc", []),
        [{ id: "current", url: "data:image/png;base64,abc" }],
    );
});

Deno.test("buildWallpaperSelectionPatch: merges focal composition with fallback", () => {
    const url1 = "/api/wallpaper/00000000-0000-4000-8000-000000000001";
    const url2 = "/api/wallpaper/00000000-0000-4000-8000-000000000002";
    const url3 = "https://example.com/bg-3.jpg";

    const patchFromRecord = buildWallpaperSelectionPatch(
        { id: "1", url: url1, focalX: 0.25, focalY: 0.75 },
        {},
    );
    assertEquals(patchFromRecord.wallpaper, url1);
    assertEquals(
        patchFromRecord.wallpaperPresentations[url1]?.composition,
        { focalX: 0.25, focalY: 0.75 },
    );

    const patchFromExisting = buildWallpaperSelectionPatch(
        { id: "2", url: url2 },
        {
            [url2]: {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                composition: { focalX: 0.4, focalY: 0.6 },
            },
        },
    );
    assertEquals(
        patchFromExisting.wallpaperPresentations[url2]
            ?.composition,
        { focalX: 0.4, focalY: 0.6 },
    );

    const patchDefault = buildWallpaperSelectionPatch(
        { id: "3", url: url3 },
        {},
    );
    assertEquals(
        patchDefault.wallpaperPresentations[url3]?.composition,
        { focalX: 0.5, focalY: 0.5 },
    );
});

Deno.test("DARK_WALLPAPER_MODE_CHOICES: exposes 4 orthogonal modes led by follow (跟随)", () => {
    assertEquals(DARK_WALLPAPER_MODE_CHOICES, [
        ["follow", "跟随浅色", "跟随"],
        ["ambient", "氛围流光", "流光"],
        ["canvas", "深黑画布", "纯黑"],
        ["custom", "独立壁纸", "独立"],
    ]);
});

Deno.test("resolveEffectiveWallpaper: resolves light/dark slots across all 4 darkWallpaperMode options", () => {
    const lightUrl = "https://example.com/light.jpg";
    const darkUrl = "https://example.com/dark.jpg";

    // Light scheme ignores darkWallpaperMode and uses light wallpaper
    assertEquals(
        resolveEffectiveWallpaper({
            scheme: "light",
            wallpaper: lightUrl,
            darkWallpaper: darkUrl,
            darkWallpaperMode: "canvas",
        }),
        { source: lightUrl, renderMode: "image", hasImageOverlay: true },
    );

    // Dark follow
    assertEquals(
        resolveEffectiveWallpaper({
            scheme: "dark",
            wallpaper: lightUrl,
            darkWallpaper: darkUrl,
            darkWallpaperMode: "follow",
        }),
        { source: lightUrl, renderMode: "image", hasImageOverlay: true },
    );
    assertEquals(
        resolveEffectiveWallpaper({
            scheme: "dark",
            wallpaper: "",
            darkWallpaper: darkUrl,
            darkWallpaperMode: "follow",
        }),
        { source: "", renderMode: "canvas", hasImageOverlay: false },
    );

    // Dark ambient (no image overlay stroke on foreground typography)
    assertEquals(
        resolveEffectiveWallpaper({
            scheme: "dark",
            wallpaper: lightUrl,
            darkWallpaper: darkUrl,
            darkWallpaperMode: "ambient",
        }),
        { source: lightUrl, renderMode: "ambient", hasImageOverlay: false },
    );

    // Dark canvas hides wallpaper completely
    assertEquals(
        resolveEffectiveWallpaper({
            scheme: "dark",
            wallpaper: lightUrl,
            darkWallpaper: darkUrl,
            darkWallpaperMode: "canvas",
        }),
        { source: "", renderMode: "canvas", hasImageOverlay: false },
    );

    // Dark custom uses dedicated dark wallpaper (does not fall back to light image)
    assertEquals(
        resolveEffectiveWallpaper({
            scheme: "dark",
            wallpaper: lightUrl,
            darkWallpaper: darkUrl,
            darkWallpaperMode: "custom",
        }),
        {
            source: darkUrl,
            renderMode: "image",
            hasImageOverlay: true,
        },
    );
    assertEquals(
        resolveEffectiveWallpaper({
            scheme: "dark",
            wallpaper: lightUrl,
            darkWallpaper: "",
            darkWallpaperMode: "custom",
        }),
        {
            source: "",
            renderMode: "canvas",
            hasImageOverlay: false,
        },
    );
});

Deno.test("buildDarkWallpaperSelectionPatch: sets darkWallpaper while protecting active light data URL", () => {
    const lightData = "data:image/png;base64,bGlnaHQ=";
    const darkUrl = "/api/wallpaper/00000000-0000-4000-8000-000000000009";
    const patch = buildDarkWallpaperSelectionPatch(
        { id: "dark-1", url: darkUrl, focalX: 0.6, focalY: 0.4 },
        {
            [lightData]: {
                ...DEFAULT_WALLPAPER_PRESENTATION,
                composition: { focalX: 0.3, focalY: 0.7 },
            },
        },
        [lightData, darkUrl],
    );
    assertEquals(patch.darkWallpaper, darkUrl);
    assertEquals(
        patch.wallpaperPresentations[lightData]?.composition,
        { focalX: 0.3, focalY: 0.7 },
    );
    assertEquals(
        patch.wallpaperPresentations[darkUrl]?.composition,
        { focalX: 0.6, focalY: 0.4 },
    );
});
