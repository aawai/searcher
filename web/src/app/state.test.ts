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

Deno.test("Appearance: old device preferences gain ambient defaults without overwriting zero mask", () => {
    const result = normalizeAppearance({ mask: 0, accent: "violet" });
    assertEquals(result.mask, 0);
    assertEquals(result.accent, "violet");
    assertEquals(result.wallpaperGlowStrength, 0.14);
    assertEquals(result.ambientMotionMode, "breathe_ripple");
    assertEquals(result.ambientMotionStrength, 0.35);
});

Deno.test("Appearance: invalid ambient cache values fall back while valid boundaries survive", () => {
    const invalid = normalizeAppearance({
        wallpaperGlowStrength: NaN,
        ambientMotionStrength: Infinity,
        ambientMotionMode: "old_mode",
    });
    assertEquals(invalid.wallpaperGlowStrength, 0.14);
    assertEquals(invalid.ambientMotionStrength, 0.35);
    assertEquals(invalid.ambientMotionMode, "breathe_ripple");
    for (const strength of [0, 1]) {
        const valid = normalizeAppearance({
            wallpaperGlowStrength: strength * 0.3,
            ambientMotionStrength: strength,
            ambientMotionMode: "off",
        });
        assertEquals(valid.wallpaperGlowStrength, strength * 0.3);
        assertEquals(valid.ambientMotionStrength, strength);
        assertEquals(valid.ambientMotionMode, "off");
    }
});
Deno.test("Appearance: switching cached wallpapers restores their own composition", () => {
    const first = "https://example.com/left.png";
    const second = "https://example.com/right.png";
    const result = normalizeAppearance({
        wallpaper: second,
        wallpaperCompositions: {
            [first]: { focalX: 0.2, focalY: 0.3 },
            [second]: { focalX: 0.8, focalY: 0.7 },
        },
    });
    assertEquals(result.wallpaperCompositions[first], {
        focalX: 0.2,
        focalY: 0.3,
    });
    assertEquals(result.wallpaperCompositions[second], {
        focalX: 0.8,
        focalY: 0.7,
    });
    assertEquals(
        normalizeAppearance({ wallpaper: first }).wallpaperCompositions,
        {},
    );
});
Deno.test("Appearance: guest image cache keeps only the current local asset and rejects oversized images", () => {
    const current = "data:image/png;base64,aGVsbG8=";
    const previous = "data:image/png;base64,b2xk";
    const result = normalizeAppearance({
        wallpaper: current,
        wallpaperCompositions: {
            [current]: { focalX: 0.2, focalY: 0.3 },
            [previous]: { focalX: 0.8, focalY: 0.7 },
        },
    });
    assertEquals(result.wallpaper, current);
    assertEquals(result.wallpaperCompositions[previous], undefined);
    const oversized = "data:image/png;base64," +
        "A".repeat(4 * Math.ceil(5 * 1024 * 1024 / 3) + 4);
    assertEquals(normalizeAppearance({ wallpaper: oversized }).wallpaper, "");
});
