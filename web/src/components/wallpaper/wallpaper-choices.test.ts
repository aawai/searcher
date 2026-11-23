import { assertEquals } from "@std/assert";
import { DEFAULT_WALLPAPER_PRESENTATION } from "@shared/wallpaper-presentation.ts";
import {
    buildWallpaperHistoryItems,
    buildWallpaperSelectionPatch,
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
