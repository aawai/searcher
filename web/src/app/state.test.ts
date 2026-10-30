import { assertEquals, assertRejects } from "@std/assert";
import type { UserDto } from "@shared/contracts.ts";
import { ApiError } from "../lib/api.ts";
import {
    type Appearance,
    handleAuthCheckResult,
    normalizeAppearance,
} from "./state.tsx";
import {
    type AppearanceSyncQueue,
    createAppearanceOwnerStore,
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
        });
        assertEquals(result.showAppLabels, false);
        assertEquals("webAppIconSize" in result, false);
    }
});

Deno.test("Appearance: home app toggles default on and only accept booleans", () => {
    for (const key of ["showHomeApps", "showHomeAppPlate"] as const) {
        assertEquals(normalizeAppearance(undefined)[key], true);
        assertEquals(normalizeAppearance({})[key], true);
        assertEquals(normalizeAppearance({ [key]: false })[key], false);
        assertEquals(normalizeAppearance({ [key]: true })[key], true);
        for (const bad of ["false", 0, null, "off"]) {
            assertEquals(normalizeAppearance({ [key]: bad })[key], true);
        }
    }
});

Deno.test("Appearance: the calm layer shows the date and 继续 by default, time only on request", () => {
    const defaults = normalizeAppearance({});
    assertEquals(
        [
            defaults.showHomeDate,
            defaults.showHomeTime,
            defaults.showHomeContinue,
        ],
        [true, false, true],
    );
    const saved = normalizeAppearance({
        showHomeDate: false,
        showHomeTime: true,
        showHomeContinue: false,
    });
    assertEquals(
        [saved.showHomeDate, saved.showHomeTime, saved.showHomeContinue],
        [false, true, false],
    );
    // Older caches and invalid values fall back to the defaults.
    const invalid = normalizeAppearance({
        showHomeDate: "no",
        showHomeTime: 1,
        showHomeContinue: null,
    });
    assertEquals(
        [invalid.showHomeDate, invalid.showHomeTime, invalid.showHomeContinue],
        [true, false, true],
    );
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

Deno.test("Appearance: device caches keep their accent; new or unreadable caches follow the wallpaper", () => {
    // Older anonymous caches always stored an accent (blue by default): no jump on upgrade.
    assertEquals(normalizeAppearance({ accent: "blue" }).accent, "blue");
    assertEquals(normalizeAppearance({ accent: "amber" }).accent, "amber");
    assertEquals(
        normalizeAppearance({ accent: "wallpaper" }).accent,
        "wallpaper",
    );
    assertEquals(normalizeAppearance(undefined).accent, "wallpaper");
    assertEquals(normalizeAppearance({ accent: "neon" }).accent, "wallpaper");
});

Deno.test("Appearance store: anonymous local upload waits for IndexedDB commit and survives reload without redundant hydration writes", async () => {
    const remoteWallpaper = "https://example.com/wallpaper.jpg";
    const uploadedPng = "data:image/png;base64,aGVsbG8=";
    const db = new Map<string, Appearance>();
    db.set(
        "appearance:anonymous",
        normalizeAppearance({
            wallpaper: remoteWallpaper,
            wallpaperPresentations: {
                [remoteWallpaper]: {
                    composition: { focalX: 0.5, focalY: 0.5 },
                    readability: "balanced",
                },
            },
        }),
    );

    let writeGate: PromiseWithResolvers<void> | null = null;
    const writes: Array<{ key: string; wallpaper: string }> = [];
    let rendered: Appearance = normalizeAppearance({});
    let ready = false;

    const store = createAppearanceOwnerStore<Appearance>({
        userId: null,
        initial: normalizeAppearance({}),
        normalize: normalizeAppearance,
        readLocal: (key) => Promise.resolve(db.get(key)),
        writeLocal: async (key, value) => {
            if (writeGate) await writeGate.promise;
            db.set(key, value);
            writes.push({ key, wallpaper: value.wallpaper });
        },
        onChange: (next) => {
            rendered = next;
        },
        onHydrated: () => {
            ready = true;
        },
    });

    assertEquals(ready, false);
    await store.hydrate();
    assertEquals(ready, true);
    assertEquals(rendered.wallpaper, remoteWallpaper);
    // Hydration must not redundantly re-write the unchanged cached wallpaper.
    assertEquals(writes.length, 0);

    writeGate = Promise.withResolvers<void>();
    let uploadSettled = false;
    const uploadPromise = store.update({
        wallpaper: uploadedPng,
        wallpaperPresentations: {
            [remoteWallpaper]: {
                composition: { focalX: 0.5, focalY: 0.5 },
                readability: "balanced",
            },
            [uploadedPng]: {
                composition: { focalX: 0.5, focalY: 0.5 },
                readability: "clear",
            },
        },
    }).then(() => {
        uploadSettled = true;
    });

    // UI updates optimistically, but the promise awaited before showing "已上传"
    // stays pending until the IndexedDB transaction commits.
    assertEquals(rendered.wallpaper, uploadedPng);
    await Promise.resolve();
    assertEquals(uploadSettled, false);
    assertEquals(db.get("appearance:anonymous")?.wallpaper, remoteWallpaper);

    writeGate.resolve();
    await uploadPromise;
    assertEquals(uploadSettled, true);
    assertEquals(db.get("appearance:anonymous")?.wallpaper, uploadedPng);

    // Simulate page reload and navigation to "/" reading from IndexedDB.
    writeGate = null;
    let reloadedRendered: Appearance = normalizeAppearance({});
    let reloadedReady = false;
    const reloadedStore = createAppearanceOwnerStore<Appearance>({
        userId: null,
        initial: normalizeAppearance({}),
        normalize: normalizeAppearance,
        readLocal: (key) => Promise.resolve(db.get(key)),
        writeLocal: (key, value) => {
            db.set(key, value);
            writes.push({ key, wallpaper: value.wallpaper });
            return Promise.resolve();
        },
        onChange: (next) => {
            reloadedRendered = next;
        },
        onHydrated: () => {
            reloadedReady = true;
        },
    });

    await reloadedStore.hydrate();
    assertEquals(reloadedReady, true);
    assertEquals(reloadedRendered.wallpaper, uploadedPng);
    assertEquals(
        reloadedRendered.wallpaperPresentations[uploadedPng]?.readability,
        "clear",
    );
    assertEquals(writes.length, 1);
});

Deno.test("Appearance store: early update during slow IndexedDB hydration merges onto cached appearance and awaits write completion", async () => {
    const remoteWallpaper = "https://example.com/wallpaper.jpg";
    const uploadedPng = "data:image/png;base64,aGVsbG8=";
    const readGate = Promise.withResolvers<unknown>();
    const writeGate = Promise.withResolvers<void>();
    const db = new Map<string, Appearance>();
    let rendered: Appearance = normalizeAppearance({});
    let ready = false;

    const store = createAppearanceOwnerStore<Appearance>({
        userId: null,
        initial: normalizeAppearance({}),
        normalize: normalizeAppearance,
        readLocal: () => readGate.promise,
        writeLocal: async (key, value) => {
            await writeGate.promise;
            db.set(key, value);
        },
        onChange: (next) => {
            rendered = next;
        },
        onHydrated: () => {
            ready = true;
        },
    });

    const hydratePromise = store.hydrate();
    assertEquals(ready, false);

    let updateSettled = false;
    const updatePromise = store.update({
        wallpaper: uploadedPng,
        wallpaperPresentations: {
            [uploadedPng]: {
                composition: { focalX: 0.2, focalY: 0.3 },
                readability: "quiet",
            },
        },
    }).then(() => {
        updateSettled = true;
    });

    // Late readLocal resolves with an existing dark theme + old remote wallpaper.
    readGate.resolve({
        theme: "dark",
        wallpaper: remoteWallpaper,
    });
    await Promise.resolve();
    await Promise.resolve();

    assertEquals(ready, true);
    assertEquals(rendered.theme, "dark");
    assertEquals(rendered.wallpaper, uploadedPng);
    assertEquals(updateSettled, false);

    writeGate.resolve();
    await Promise.all([hydratePromise, updatePromise]);
    assertEquals(updateSettled, true);
    assertEquals(db.get("appearance:anonymous")?.theme, "dark");
    assertEquals(db.get("appearance:anonymous")?.wallpaper, uploadedPng);
});

Deno.test("Appearance store: failed local commit rejects the upload completion, including during hydration", async () => {
    for (const duringHydration of [false, true]) {
        const failure = new DOMException(
            "Storage is full",
            "QuotaExceededError",
        );
        const readGate = Promise.withResolvers<unknown>();
        const store = createAppearanceOwnerStore<Appearance>({
            userId: null,
            initial: normalizeAppearance({}),
            normalize: normalizeAppearance,
            readLocal: () => readGate.promise,
            writeLocal: () => Promise.reject(failure),
            onChange: () => {},
        });
        const hydration = store.hydrate();
        if (!duringHydration) {
            readGate.resolve({});
            await hydration;
        }
        const upload = store.update({
            wallpaper: "data:image/png;base64,aGVsbG8=",
        });
        const rejected = assertRejects(
            () => upload,
            DOMException,
            "Storage is full",
        );
        if (duringHydration) {
            const hydrationRejected = assertRejects(
                () => hydration,
                DOMException,
                "Storage is full",
            );
            readGate.resolve({});
            await hydrationRejected;
        }
        await rejected;
        await store.settle();
    }
});

Deno.test("Appearance store: a stale owner read or cloud response cannot cross account boundaries", async () => {
    const read = Promise.withResolvers<unknown>();
    const writes = new Map<string, Appearance>();
    const oldChanges: Appearance[] = [];
    const old = createAppearanceOwnerStore<Appearance>({
        userId: "user-a",
        initial: normalizeAppearance({}),
        normalize: normalizeAppearance,
        readLocal: () => read.promise,
        writeLocal: (key, value) => {
            writes.set(key, value);
            return Promise.resolve();
        },
        onChange: (value) => oldChanges.push(value),
    });
    const hydration = old.hydrate();
    const earlyUpdate = old.update({ theme: "dark" });
    old.dispose();
    const guest = createAppearanceOwnerStore<Appearance>({
        userId: null,
        initial: normalizeAppearance({}),
        normalize: normalizeAppearance,
        readLocal: () => Promise.resolve({ theme: "light" }),
        writeLocal: (key, value) => {
            writes.set(key, value);
            return Promise.resolve();
        },
        onChange: () => {},
    });
    await guest.hydrate();
    read.resolve({
        theme: "dark",
        wallpaper: "https://example.com/private.png",
    });
    assertEquals(await hydration, false);
    await earlyUpdate;
    assertEquals(
        await old.applyCloud({ theme: "dark" }, old.revision()),
        false,
    );
    assertEquals(oldChanges.length, 1);
    assertEquals(writes.size, 0);
    assertEquals(guest.current().theme, "light");
    assertEquals(guest.current().wallpaper, "");
    await guest.update({ theme: "dark" });
    assertEquals([...writes.keys()], ["appearance:anonymous"]);
});

Deno.test("Appearance store: delayed cloud snapshots do not overwrite a newer local choice", async () => {
    let persisted = normalizeAppearance({});
    const store = createAppearanceOwnerStore<Appearance>({
        userId: "user-a",
        initial: persisted,
        normalize: normalizeAppearance,
        readLocal: () => Promise.resolve(persisted),
        writeLocal: (_key, value) => {
            persisted = value;
            return Promise.resolve();
        },
        onChange: () => {},
    });
    await store.hydrate();
    const cloudRevision = store.revision();
    await store.update({ theme: "dark" });
    assertEquals(
        await store.applyCloud({ theme: "light" }, cloudRevision),
        false,
    );
    assertEquals(store.current().theme, "dark");
    assertEquals(persisted.theme, "dark");
});
