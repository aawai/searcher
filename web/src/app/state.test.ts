import { assertEquals } from "@std/assert";
import type { UserDto } from "@shared/contracts.ts";
import { ApiError } from "../lib/api.ts";
import { handleAuthCheckResult, normalizeAppearance } from "./state.tsx";
import {
    type AppearanceSyncQueue,
    queueAppearanceSync,
} from "./appearance-sync.ts";

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

Deno.test("Appearance: old device preferences migrate wallpaper mask to semantic readability", () => {
    const wallpaper = "https://example.com/bg.png";
    const result = normalizeAppearance({
        wallpaper,
        mask: 0,
        accent: "violet",
    });
    assertEquals(result.accent, "violet");
    const pres = result.wallpaperPresentations[wallpaper];
    assertEquals(pres.readability, "clear");
});

Deno.test("Appearance: device caches keep a valid glass tier and fall back for stale or unknown values", () => {
    assertEquals(
        normalizeAppearance({ glassIntensity: "clear" }).glassIntensity,
        "clear",
    );
    assertEquals(
        normalizeAppearance({ glassIntensity: "off" }).glassIntensity,
        "off",
    );
    // Caches written before glass tiers carried a numeric searchOpacity.
    assertEquals(
        normalizeAppearance({ searchOpacity: 0.4 }).glassIntensity,
        "regular",
    );
    assertEquals(
        normalizeAppearance({ glassIntensity: "frosted" }).glassIntensity,
        "regular",
    );
});

Deno.test("Appearance: legacy icon size fields are ignored without losing valid preferences", () => {
    for (const webAppIconSize of ["compact", "default", "large", "unknown"]) {
        const result = normalizeAppearance({
            webAppIconSize,
            showAppLabels: false,
            webAppHomeLimit: 16,
        });
        assertEquals(result.showAppLabels, false);
        assertEquals(result.webAppHomeLimit, 16);
        assertEquals("webAppIconSize" in result, false);
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
            },
            [second]: {
                composition: { focalX: 0.8, focalY: 0.7 },
                readability: "quiet",
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
            },
            [previous]: {
                composition: { focalX: 0.8, focalY: 0.7 },
                readability: "quiet",
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
            },
        },
    });
    const pres = result.wallpaperPresentations["https://example.com/test.png"];
    assertEquals(pres.readability, "balanced");
});

Deno.test("Appearance sync: a failed patch remains queued for an explicit retry", async () => {
    const queue: AppearanceSyncQueue = {
        owner: "user-a",
        tail: Promise.resolve(),
        pending: { theme: "dark" },
        reconciled: {},
    };
    const calls: Record<string, unknown>[] = [];
    const failure = new Error("temporarily unavailable");
    let shouldFail = true;
    let succeeded = false;
    const failures: unknown[] = [];
    const send = (patch: Record<string, unknown>) => {
        calls.push({ ...patch });
        if (shouldFail) return Promise.reject(failure);
        return Promise.resolve();
    };
    const retry = () =>
        queueAppearanceSync(
            queue,
            "user-a",
            () => queue.owner === "user-a",
            send,
            () => succeeded = true,
            (error) => failures.push(error),
        );

    try {
        await retry();
    } catch {
        // The failed request remains available for the next explicit retry.
    }
    assertEquals(queue.pending, { theme: "dark" });
    assertEquals(failures, [failure]);

    shouldFail = false;
    await retry();
    assertEquals(calls, [
        { theme: "dark" },
        { theme: "dark" },
    ]);
    assertEquals(queue.pending, {});
    assertEquals(succeeded, true);
});
