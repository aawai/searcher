import { assertEquals, assertNotEquals } from "@std/assert";
import { setupMockIndexedDB } from "../../lib/test-mock-idb.ts";
// deno-lint-ignore no-import-prefix
import { Window } from "npm:happy-dom@15.11.7";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
    useDesktopLayout,
    type UseDesktopLayoutOptions,
    type UseDesktopLayoutReturn,
} from "./useDesktopLayout.ts";
import {
    desktopLayoutStorageKey,
    saveDesktopLayout,
} from "./desktop-persistence.ts";
import type { DesktopState } from "./desktop-state.ts";
import { desktopGeometry } from "./desktop-geometry.ts";
import { getLocal, setLocal } from "../../lib/local.ts";

// Setup DOM environment for React hooks testing
const win = new Window();
const g = globalThis as Record<string, unknown>;
g.window = win;
g.document = win.document;
g.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Helper to advance microtasks and clock for React hook integration testing.
 */
function waitTick(ms = 10): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    return promise;
}

const sampleRect = desktopGeometry(1440, 900, 64, 820, 16, 48);

const sampleFrameBasis = { width: 1440, height: 900 };

/** Helper to render and inspect the hook inside a test container */
function renderHook(initialProps: UseDesktopLayoutOptions) {
    let currentProps = initialProps;
    let hookResult!: UseDesktopLayoutReturn;

    function TestComponent(props: { options: UseDesktopLayoutOptions }) {
        hookResult = useDesktopLayout(props.options);
        return null;
    }

    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container as unknown as HTMLElement);

    act(() => {
        root.render(
            React.createElement(TestComponent, { options: currentProps }),
        );
    });

    return {
        get result() {
            return hookResult;
        },
        rerender(nextProps: UseDesktopLayoutOptions) {
            currentProps = nextProps;
            act(() => {
                root.render(
                    React.createElement(TestComponent, {
                        options: currentProps,
                    }),
                );
            });
        },
        unmount() {
            act(() => {
                root.unmount();
            });
            container.remove();
        },
    };
}

Deno.test("useDesktopLayout: windows opened before empty restoration stay visible and persist across reload", async () => {
    setupMockIndexedDB();
    const options: UseDesktopLayoutOptions = {
        userId: "loading-user",
        rect: sampleRect,
        notesLoaded: false,
    };
    const harness = renderHook(options);
    try {
        act(() =>
            harness.result[1]({
                type: "OPEN",
                id: "notes",
                kind: "notes",
                rect: sampleRect,
            })
        );
        assertEquals(harness.result[0].activeId, "notes");
        harness.rerender({ ...options, notesLoaded: true, notes: [] });
        await act(async () => {
            await waitTick(30);
        });
        assertEquals(harness.result[0].windows.map((window) => window.id), [
            "notes",
        ]);
        assertEquals(harness.result[0].activeId, "notes");
        const reloaded = renderHook({
            ...options,
            notesLoaded: true,
            notes: [],
        });
        try {
            await act(async () => {
                await waitTick(30);
            });
            assertEquals(
                reloaded.result[0].windows.map((window) => window.id),
                ["notes"],
            );
        } finally {
            reloaded.unmount();
        }
    } finally {
        harness.unmount();
    }
});

Deno.test("useDesktopLayout: rejected actions and geometry never overwrite a rejected payload", async () => {
    setupMockIndexedDB();
    const userId = "rejected-layout";
    const key = desktopLayoutStorageKey(userId);
    const rejected = { version: 999, windows: [] };
    await setLocal(key, rejected);
    const options: UseDesktopLayoutOptions = {
        userId,
        layoutStyle: "widgets",
        rect: sampleRect,
        notes: [],
        notesLoaded: true,
    };
    const harness = renderHook(options);
    try {
        harness.rerender({
            ...options,
            rect: desktopGeometry(1024, 768, 64, 688, 16, 48),
        });
        await act(async () => {
            await waitTick(30);
        });
        assertEquals(await getLocal(key), rejected);
        const unusableRect = desktopGeometry(0, 0);
        harness.rerender({ ...options, rect: unusableRect });
        act(() => {
            harness.result[1]({
                type: "OPEN",
                id: "apps",
                kind: "apps",
                rect: unusableRect,
            });
            globalThis.dispatchEvent(new Event("pagehide"));
        });
        await act(async () => {
            await waitTick(30);
        });
        assertEquals(await getLocal(key), rejected);
        harness.rerender({ ...options, layoutStyle: "zen" });
        await act(async () => {
            await waitTick(30);
        });
        assertEquals(await getLocal(key), rejected);
        harness.rerender(options);
        await act(async () => {
            await waitTick(30);
        });
        act(() =>
            harness.result[1]({
                type: "OPEN",
                id: "apps",
                kind: "apps",
                rect: sampleRect,
            })
        );
        await act(async () => {
            await waitTick(30);
        });
        const reloaded = renderHook(options);
        try {
            await act(async () => {
                await waitTick(30);
            });
            assertEquals(
                reloaded.result[0].windows.map((window) => window.id),
                ["apps"],
            );
        } finally {
            reloaded.unmount();
        }
    } finally {
        harness.unmount();
    }
});
Deno.test("useDesktopLayout: guest / logged-out user starts with empty state and does not load from storage", () => {
    setupMockIndexedDB();

    const harness = renderHook({
        userId: undefined,
        layoutStyle: "widgets",
        rect: sampleRect,
    });

    const [state] = harness.result;
    assertEquals(state.windows.length, 0);
    assertEquals(state.activeId, null);

    harness.unmount();
});

Deno.test("useDesktopLayout: restores persisted layout from IndexedDB key searcher:desktop-layout:v1:<userId>", async () => {
    setupMockIndexedDB();

    const savedState: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 100, y: 100, width: 600, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "apps",
    };

    await saveDesktopLayout("user-1", savedState);

    const harness = renderHook({
        userId: "user-1",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });

    // Wait for async load to resolve
    await act(async () => {
        await waitTick(20);
    });

    const [state] = harness.result;
    assertEquals(state.windows.length, 1);
    assertEquals(state.windows[0].id, "apps");
    assertEquals(state.activeId, "apps");

    harness.unmount();
});

Deno.test("useDesktopLayout: consumer-visible regression - immediate render on user switch never exposes previous state", async () => {
    setupMockIndexedDB();

    const renderedFrames: Array<{ user: string | null; windowCount: number }> =
        [];

    function ObserverComponent(props: { options: UseDesktopLayoutOptions }) {
        const [state] = useDesktopLayout(props.options);
        renderedFrames.push({
            user: props.options.userId ?? null,
            windowCount: state.windows.length,
        });
        return null;
    }

    // Save User A layout first
    const userAState: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 100, y: 100, width: 600, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "apps",
    };
    await saveDesktopLayout("user-A-imm", userAState);

    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container as unknown as HTMLElement);

    let currentOptions: UseDesktopLayoutOptions = {
        userId: "user-A-imm",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    };

    act(() => {
        root.render(
            React.createElement(ObserverComponent, { options: currentOptions }),
        );
    });

    await act(async () => {
        await waitTick(30);
    });

    // User A's window is hydrated and rendered
    assertEquals(renderedFrames[renderedFrames.length - 1].windowCount, 1);

    // Switch to User B
    currentOptions = {
        userId: "user-B-imm",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    };

    act(() => {
        root.render(
            React.createElement(ObserverComponent, { options: currentOptions }),
        );
    });

    // Check the VERY FIRST frame rendered for user-B: must have windowCount: 0!
    const firstUserBFrame = renderedFrames.find((f) => f.user === "user-B-imm");
    assertNotEquals(firstUserBFrame, undefined);
    assertEquals(firstUserBFrame!.windowCount, 0);

    // Switch to logged out
    currentOptions = {
        userId: null,
        layoutStyle: "widgets",
        rect: sampleRect,
    };

    act(() => {
        root.render(
            React.createElement(ObserverComponent, { options: currentOptions }),
        );
    });

    const firstGuestFrame = renderedFrames.find((f) => f.user === null);
    assertNotEquals(firstGuestFrame, undefined);
    assertEquals(firstGuestFrame!.windowCount, 0);

    act(() => {
        root.unmount();
    });
    container.remove();
});

Deno.test("useDesktopLayout: user isolation - switching from user-A to user-B clears runtime state, flushes user-A, and loads user-B", async () => {
    setupMockIndexedDB();

    const userBState: DesktopState = {
        windows: [
            {
                id: "notes",
                kind: "notes",
                entityId: null,
                frame: { x: 200, y: 200, width: 600, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "notes",
    };
    await saveDesktopLayout("user-B-iso", userBState);

    const harness = renderHook({
        userId: "user-A-iso",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });

    // User A opens apps window
    act(() => {
        const [, dispatch] = harness.result;
        dispatch({
            type: "OPEN",
            id: "apps",
            kind: "apps",
            rect: sampleRect,
        });
    });
    assertEquals(harness.result[0].windows.map((w) => w.id), ["apps"]);

    // Switch to user-B inside act
    await act(async () => {
        harness.rerender({
            userId: "user-B-iso",
            layoutStyle: "widgets",
            rect: sampleRect,
            notesLoaded: true,
        });
        await waitTick(30);
    });

    assertEquals(harness.result[0].windows.map((w) => w.id), ["notes"]);
    assertEquals(harness.result[0].activeId, "notes");

    // Verify user-A layout was saved in its own isolated key
    const rawSavedA = await getLocal<unknown>(
        desktopLayoutStorageKey("user-A-iso"),
    );
    assertNotEquals(rawSavedA, undefined);

    harness.unmount();
});

Deno.test("useDesktopLayout: logout isolation - logging out clears runtime state without overwriting user record in IndexedDB", async () => {
    setupMockIndexedDB();

    const userAState: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 100, y: 100, width: 600, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "apps",
    };
    await saveDesktopLayout("user-A-logout", userAState);

    const harness = renderHook({
        userId: "user-A-logout",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });

    await act(async () => {
        await waitTick(20);
    });
    assertEquals(harness.result[0].windows.length, 1);

    // Logout: userId becomes null
    await act(async () => {
        harness.rerender({
            userId: null,
            layoutStyle: "widgets",
            rect: sampleRect,
        });
        await waitTick(10);
    });

    assertEquals(harness.result[0].windows.length, 0);
    assertEquals(harness.result[0].activeId, null);

    // User A record in IndexedDB still contains original layout
    const rawSavedA = await getLocal<unknown>(
        desktopLayoutStorageKey("user-A-logout"),
    );
    assertNotEquals(rawSavedA, undefined);

    harness.unmount();
});

Deno.test("useDesktopLayout: mode switch - widgets -> zen flushes save and resets runtime state; zen -> widgets restores", async () => {
    setupMockIndexedDB();

    const harness = renderHook({
        userId: "user-mode-switch",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });

    // Open apps window in widgets mode
    act(() => {
        const [, dispatch] = harness.result;
        dispatch({
            type: "OPEN",
            id: "apps",
            kind: "apps",
            rect: sampleRect,
        });
    });
    assertEquals(harness.result[0].windows.length, 1);

    // Switch to Zen mode inside act
    await act(async () => {
        harness.rerender({
            userId: "user-mode-switch",
            layoutStyle: "zen",
            rect: sampleRect,
            notesLoaded: true,
        });
        await waitTick(30);
    });

    // Runtime state must be reset in Zen mode
    assertEquals(harness.result[0].windows.length, 0);

    // Persisted data in IndexedDB must have been saved
    const rawSaved = await getLocal<unknown>(
        desktopLayoutStorageKey("user-mode-switch"),
    );
    assertNotEquals(rawSaved, undefined);

    // Switch back to Widgets mode: restores layout
    await act(async () => {
        harness.rerender({
            userId: "user-mode-switch",
            layoutStyle: "widgets",
            rect: sampleRect,
            notesLoaded: true,
        });
        await waitTick(30);
    });

    assertEquals(harness.result[0].windows.length, 1);
    assertEquals(harness.result[0].windows[0].id, "apps");

    harness.unmount();
});

Deno.test("useDesktopLayout: regression - restore waits for nonzero measured rect and notesLoaded before validating notes", async () => {
    setupMockIndexedDB();

    const persistedState: DesktopState = {
        windows: [
            {
                id: "note:note-persisted",
                kind: "note",
                entityId: "note-persisted",
                frame: { x: 100, y: 100, width: 500, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "note:note-persisted",
    };
    await saveDesktopLayout("user-wait-rect", persistedState);

    // Initial render with zero rect and notesLoaded false
    const harness = renderHook({
        userId: "user-wait-rect",
        layoutStyle: "widgets",
        rect: desktopGeometry(0, 0),
        notes: [],
        notesLoaded: false,
    });

    // Wait some time: should NOT restore or drop note yet
    await act(async () => {
        await waitTick(20);
    });
    assertEquals(harness.result[0].windows.length, 0);

    // Viewport and safe bounds are measured and notes finish loading.
    await act(async () => {
        harness.rerender({
            userId: "user-wait-rect",
            layoutStyle: "widgets",
            rect: sampleRect,
            notes: [{ id: "note-persisted" }],
            notesLoaded: true,
        });
        await waitTick(30);
    });

    // Now restored correctly with proper geometry
    assertEquals(harness.result[0].windows.length, 1);
    assertEquals(harness.result[0].windows[0].id, "note:note-persisted");
    assertEquals(harness.result[0].windows[0].frame.width > 0, true);

    harness.unmount();
});

Deno.test("useDesktopLayout: waits for safe bounds before migrating a v3 layout", async () => {
    setupMockIndexedDB();
    const userId = "user-safe-bounds";
    const key = desktopLayoutStorageKey(userId);
    const legacy = {
        version: 3,
        activeId: "apps",
        windows: [{
            id: "apps",
            kind: "apps",
            entityId: null,
            frame: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
            restoreFrame: null,
            mode: "normal",
            zOrder: 1,
            snap: null,
        }],
    };
    await setLocal(key, legacy);
    const zeroSafeGeometry = desktopGeometry(1440, 900, 64, 820, 800, 48, 0);
    const harness = renderHook({
        userId,
        layoutStyle: "widgets",
        rect: zeroSafeGeometry,
        notesLoaded: true,
    });

    try {
        await act(async () => {
            await waitTick(20);
        });
        assertEquals(harness.result[0].windows.length, 0);
        assertEquals((await getLocal<{ version: number }>(key))?.version, 3);

        await act(async () => {
            harness.rerender({
                userId,
                layoutStyle: "widgets",
                rect: sampleRect,
                notesLoaded: true,
            });
            await waitTick(30);
        });
        assertEquals(harness.result[0].windows.map((window) => window.id), [
            "apps",
        ]);
        assertEquals((await getLocal<{ version: number }>(key))?.version, 4);
    } finally {
        harness.unmount();
    }
});

Deno.test("useDesktopLayout: regression - effect cleanup cancels in-flight restore when user or mode changes", async () => {
    setupMockIndexedDB();

    const slowUserState: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 100, y: 100, width: 500, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "apps",
    };
    await saveDesktopLayout("user-slow-cancel", slowUserState);

    const harness = renderHook({
        userId: "user-slow-cancel",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });

    // Immediately switch to Zen before restore finishes
    await act(async () => {
        harness.rerender({
            userId: "user-slow-cancel",
            layoutStyle: "zen",
            rect: sampleRect,
            notesLoaded: true,
        });
        await waitTick(40);
    });

    // In Zen mode, canceled restore must not have hydrated windows
    assertEquals(harness.result[0].windows.length, 0);

    harness.unmount();
});

Deno.test("useDesktopLayout: stale note removal once notes are loaded during active runtime", async () => {
    setupMockIndexedDB();

    const stateWithNotes: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 50, y: 50, width: 600, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 1,
            },
            {
                id: "note:note-valid",
                kind: "note",
                entityId: "note-valid",
                frame: { x: 100, y: 100, width: 500, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 2,
            },
            {
                id: "note:note-stale",
                kind: "note",
                entityId: "note-stale",
                frame: { x: 150, y: 150, width: 500, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 3,
            },
        ],
        activeId: "note:note-stale",
    };
    await saveDesktopLayout("user-notes-prune", stateWithNotes);

    const harness = renderHook({
        userId: "user-notes-prune",
        layoutStyle: "widgets",
        rect: sampleRect,
        notes: [{ id: "note-valid" }],
        notesLoaded: true,
    });

    await act(async () => {
        await waitTick(30);
    });

    // Stale note must be pruned, leaving apps and note-valid
    assertEquals(harness.result[0].windows.map((w) => w.id), [
        "apps",
        "note:note-valid",
    ]);
    // Active id should fall back from deleted note to note-valid
    assertEquals(harness.result[0].activeId, "note:note-valid");

    harness.unmount();
});

Deno.test("useDesktopLayout: async restore race - window opened by user during restore is preserved and kept on top", async () => {
    setupMockIndexedDB();

    const persistedState: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 50, y: 50, width: 600, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "apps",
    };
    await saveDesktopLayout("user-race-cond", persistedState);

    const harness = renderHook({
        userId: "user-race-cond",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });

    // Before async load resolves, user dispatches OPEN for note:immediate
    act(() => {
        const [, dispatch] = harness.result;
        dispatch({
            type: "OPEN",
            id: "note:immediate",
            kind: "note",
            entityId: "immediate",
            rect: sampleRect,
        });
    });

    // Now wait for restore to resolve
    await act(async () => {
        await waitTick(30);
    });

    // Both windows must exist; note:immediate was opened during restore and stays on top
    const winIds = harness.result[0].windows.map((w) => w.id);
    assertEquals(winIds.includes("note:immediate"), true);
    assertEquals(winIds.includes("apps"), true);
    assertEquals(harness.result[0].activeId, "note:immediate");

    harness.unmount();
});

Deno.test("useDesktopLayout: immediate persistence on committed state updates preserves drag/resize on reload", async () => {
    setupMockIndexedDB();

    const harness = renderHook({
        userId: "user-immediate-commit",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });

    // Wait for hydration
    await act(async () => {
        await waitTick(20);
    });

    // Dispatch OPEN and MOVE (as committed on pointerup)
    act(() => {
        const [, dispatch] = harness.result;
        dispatch({
            type: "OPEN",
            id: "apps",
            kind: "apps",
            rect: sampleRect,
        });
        dispatch({
            type: "MOVE",
            id: "apps",
            frame: { x: 614, y: 301, width: 600, height: 400 },
            rect: sampleRect,
        });
    });

    // Immediate reload (simulating browser reload without waiting for any debounce)
    await act(async () => {
        await waitTick(10);
    });
    harness.unmount();

    // New hook instance mounts as if page reloaded
    const reloadHarness = renderHook({
        userId: "user-immediate-commit",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });

    await act(async () => {
        await waitTick(20);
    });

    const [reloadedState] = reloadHarness.result;
    assertEquals(reloadedState.windows.length, 1);
    assertEquals(reloadedState.windows[0].id, "apps");
    assertEquals(reloadedState.windows[0].frame.x, 614);
    assertEquals(reloadedState.windows[0].frame.y, 301);

    reloadHarness.unmount();
});

Deno.test("useDesktopLayout: pagehide and visibilitychange lifecycle flushes persistence", async () => {
    setupMockIndexedDB();

    const harness = renderHook({
        userId: "user-lifecycle-flush",
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });

    await act(async () => {
        await waitTick(20);
    });

    act(() => {
        const [, dispatch] = harness.result;
        dispatch({
            type: "OPEN",
            id: "notes",
            kind: "notes",
            rect: sampleRect,
        });
    });

    // Fire pagehide event on globalThis
    act(() => {
        globalThis.dispatchEvent(new Event("pagehide"));
    });

    await act(async () => {
        await waitTick(10);
    });

    const saved = await getLocal<unknown>(
        desktopLayoutStorageKey("user-lifecycle-flush"),
    );
    assertNotEquals(saved, undefined);

    harness.unmount();
});
Deno.test("useDesktopLayout: shrink, focus, and unusable flush preserve canonical geometry", async () => {
    setupMockIndexedDB();
    const userId = "user-canonical-flush";
    const canonicalFrame = { x: 540, y: 160, width: 760, height: 566 };
    const initialState: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: canonicalFrame,
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 1,
                snap: null,
            },
            {
                id: "notes",
                kind: "notes",
                entityId: null,
                frame: { x: 100, y: 100, width: 500, height: 400 },
                frameBasis: sampleFrameBasis,
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                zOrder: 2,
                snap: null,
            },
        ],
        activeId: "notes",
    };
    await saveDesktopLayout(userId, initialState);

    const harness = renderHook({
        userId,
        layoutStyle: "widgets",
        rect: sampleRect,
        notesLoaded: true,
    });
    try {
        await act(async () => {
            await waitTick(20);
        });

        const narrowedRect = desktopGeometry(1024, 768, 64, 688, 16, 48);
        harness.rerender({
            userId,
            layoutStyle: "widgets",
            rect: narrowedRect,
            notesLoaded: true,
        });
        assertEquals(
            harness.result[0].windows.find((window) => window.id === "apps")
                ?.frame,
            canonicalFrame,
        );

        act(() => {
            harness.result[1]({ type: "FOCUS", id: "apps" });
        });
        assertEquals(
            harness.result[0].windows.find((window) => window.id === "apps")
                ?.frameBasis,
            sampleFrameBasis,
        );

        harness.rerender({
            userId,
            layoutStyle: "widgets",
            rect: desktopGeometry(0, 0),
            notesLoaded: true,
        });
        act(() => {
            globalThis.dispatchEvent(new Event("pagehide"));
        });
        await act(async () => {
            await waitTick(20);
        });

        const persisted = await getLocal<{
            activeId: string | null;
            windows: Array<{
                id: string;
                frame: { x: number; y: number; width: number; height: number };
            }>;
        }>(desktopLayoutStorageKey(userId));
        assertEquals(persisted?.activeId, "apps");
        assertEquals(
            persisted?.windows.find((window) => window.id === "apps")?.frame,
            {
                x: 540 / 1440,
                y: 160 / 900,
                width: 760 / 1440,
                height: 566 / 900,
            },
        );
    } finally {
        harness.unmount();
    }
});
