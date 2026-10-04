import { assertEquals } from "@std/assert";
import type { UserDto } from "@shared/contracts.ts";
import { ApiError } from "../lib/api.ts";
import { handleAuthCheckResult, normalizeAppearance } from "./state.tsx";

Deno.test("AppState: 401 error results in anonymous user and NO connectionError", () => {
    const initial = { user: null, connectionError: false };
    const result = handleAuthCheckResult(initial, {
        type: "error",
        error: new ApiError(401, "未登录"),
    });
    assertEquals(result.user, null);
    assertEquals(result.connectionError, false);
});

Deno.test("AppState: 503 error flags connectionError without wiping existing user", () => {
    const existingUser: UserDto = {
        id: "u1",
        username: "alice",
        displayName: "Alice",
        role: "user",
    };
    const initial = { user: existingUser, connectionError: false };
    const result = handleAuthCheckResult(initial, {
        type: "error",
        error: new ApiError(503, "服务不可用"),
    });
    assertEquals(result.user, existingUser);
    assertEquals(result.connectionError, true);
});

Deno.test("AppState: Network error flags connectionError for anonymous visitor", () => {
    const initial = { user: null, connectionError: false };
    const result = handleAuthCheckResult(initial, {
        type: "error",
        error: new TypeError("Failed to fetch"),
    });
    assertEquals(result.user, null);
    assertEquals(result.connectionError, true);
});

Deno.test("AppState: Recovery after connectionError restores normal state", () => {
    const bob: UserDto = {
        id: "u2",
        username: "bob",
        displayName: "Bob",
        role: "user",
    };
    const initial = { user: null, connectionError: true };
    const result = handleAuthCheckResult(initial, {
        type: "success",
        user: bob,
    });
    assertEquals(result.user?.username, "bob");
    assertEquals(result.connectionError, false);
});

Deno.test("Appearance: old device preferences migrate to semantic wallpaper presentations and canvas motion", () => {
    const wallpaper = "https://example.com/bg.png";
    const result = normalizeAppearance({
        wallpaper,
        mask: 0,
        accent: "violet",
        wallpaperGlowStrength: 0.14,
        ambientMotionMode: "breathe_ripple",
        ambientMotionStrength: 0.35,
    });
    assertEquals(result.accent, "violet");
    assertEquals(result.canvasMotion, "ambient");
    assertEquals(result.canvasMotionLevel, "soft");
    const pres = result.wallpaperPresentations[wallpaper];
    assertEquals(pres.readability, "clear");
    assertEquals(pres.motion, "ambient");
    assertEquals(pres.motionLevel, "soft");
});

Deno.test("Appearance: invalid canvas motion cache values fall back while valid boundaries survive", () => {
    const invalid = normalizeAppearance({
        canvasMotion: "invalid_mode",
        canvasMotionLevel: "hyper_fast",
    });
    assertEquals(invalid.canvasMotion, "off");
    assertEquals(invalid.canvasMotionLevel, "soft");
    for (const motion of ["off", "ambient"] as const) {
        for (
            const level of ["subtle", "soft", "standard", "pronounced"] as const
        ) {
            const valid = normalizeAppearance({
                canvasMotion: motion,
                canvasMotionLevel: level,
            });
            assertEquals(valid.canvasMotion, motion);
            assertEquals(valid.canvasMotionLevel, level);
        }
    }
});

Deno.test("Appearance: switching cached wallpapers restores their own presentation and composition", () => {
    const first = "https://example.com/left.png";
    const second = "https://example.com/right.png";
    const result = normalizeAppearance({
        wallpaper: second,
        wallpaperPresentations: {
            [first]: {
                composition: { focalX: 0.2, focalY: 0.3 },
                readability: "clear",
                softness: "subtle",
                tone: "natural",
                motion: "off",
                motionLevel: "soft",
            },
            [second]: {
                composition: { focalX: 0.8, focalY: 0.7 },
                readability: "quiet",
                softness: "hazy",
                tone: "mono",
                motion: "drift",
                motionLevel: "pronounced",
            },
        },
    });
    assertEquals(result.wallpaperPresentations[first].composition, {
        focalX: 0.2,
        focalY: 0.3,
    });
    assertEquals(result.wallpaperPresentations[first].readability, "clear");
    assertEquals(result.wallpaperPresentations[second].composition, {
        focalX: 0.8,
        focalY: 0.7,
    });
    assertEquals(result.wallpaperPresentations[second].readability, "quiet");
    assertEquals(result.wallpaperPresentations[second].motion, "drift");
});

Deno.test("Appearance: guest image cache keeps only the current local asset and rejects oversized images", () => {
    const current = "data:image/png;base64,aGVsbG8=";
    const previous = "data:image/png;base64,b2xk";
    const result = normalizeAppearance({
        wallpaper: current,
        wallpaperPresentations: {
            [current]: {
                composition: { focalX: 0.2, focalY: 0.3 },
                readability: "clear",
                softness: "none",
                tone: "natural",
                motion: "off",
                motionLevel: "soft",
            },
            [previous]: {
                composition: { focalX: 0.8, focalY: 0.7 },
                readability: "quiet",
                softness: "none",
                tone: "natural",
                motion: "off",
                motionLevel: "soft",
            },
        },
    });
    assertEquals(result.wallpaper, current);
    assertEquals(result.wallpaperPresentations[current] !== undefined, true);
    assertEquals(result.wallpaperPresentations[previous], undefined);
    const oversized = "data:image/png;base64," +
        "A".repeat(4 * Math.ceil(5 * 1024 * 1024 / 3) + 4);
    assertEquals(normalizeAppearance({ wallpaper: oversized }).wallpaper, "");
});

Deno.test("Appearance: malformed presentation records normalize to canonical defaults safely", () => {
    const result = normalizeAppearance({
        wallpaper: "https://example.com/test.png",
        wallpaperPresentations: {
            "https://example.com/test.png": {
                readability: "invalid_readability",
                softness: "invalid_softness",
                tone: "invalid_tone",
                motion: "invalid_motion",
                motionLevel: "invalid_level",
            },
        },
    });
    const pres = result.wallpaperPresentations["https://example.com/test.png"];
    assertEquals(pres.readability, "balanced");
    assertEquals(pres.softness, "none");
    assertEquals(pres.tone, "natural");
    assertEquals(pres.motion, "off");
    assertEquals(pres.motionLevel, "soft");
});
