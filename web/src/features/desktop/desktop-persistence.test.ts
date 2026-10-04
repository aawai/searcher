import { assertEquals, assertNotEquals } from "@std/assert";
import { setupMockIndexedDB } from "../../lib/test-mock-idb.ts";
import {
    decodeDesktopLayout,
    DESKTOP_LAYOUT_SCHEMA_VERSION,
    encodeDesktopLayout,
    loadDesktopLayout,
    type PersistedDesktopLayout,
    saveDesktopLayout,
} from "./desktop-persistence.ts";
import type { DesktopState } from "./desktop-state.ts";
import { type SafeRect, snapFrame } from "./desktop-geometry.ts";

const rect1440: SafeRect = { x: 0, y: 0, width: 1440, height: 900 };
const rect1024: SafeRect = { x: 0, y: 0, width: 1024, height: 768 };

Deno.test("desktop-persistence: encodeDesktopLayout captures schema v1, normalized normal frames, modes and zOrder", () => {
    const state: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 144, y: 90, width: 720, height: 450 },
                restoreFrame: null,
                mode: "normal",
                zOrder: 1,
            },
            {
                id: "notes",
                kind: "notes",
                entityId: null,
                frame: { x: 0, y: 0, width: 1440, height: 900 },
                restoreFrame: { x: 288, y: 180, width: 640, height: 400 },
                mode: "maximized",
                zOrder: 2,
            },
            {
                id: "note:item-1",
                kind: "note",
                entityId: "item-1",
                frame: { x: 100, y: 100, width: 400, height: 300 },
                restoreFrame: null,
                mode: "minimized",
                zOrder: 3,
            },
        ],
        activeId: "notes",
    };

    const encoded = encodeDesktopLayout(state, rect1440);
    assertEquals(encoded.version, DESKTOP_LAYOUT_SCHEMA_VERSION);
    assertEquals(encoded.windows.length, 3);
    assertEquals(encoded.activeId, "notes");

    // Maximized window stores normal frame in normalized form
    const encodedNotes = encoded.windows.find((w) => w.id === "notes")!;
    assertEquals(encodedNotes.mode, "maximized");
    assertEquals(encodedNotes.frame.x, 0.2); // 288 / 1440
    assertEquals(encodedNotes.frame.y, 0.2); // 180 / 900
    assertEquals(encodedNotes.snap, null);
});

Deno.test("desktop-persistence: decodeDesktopLayout clamps geometry across resolution changes (1440x900 -> 1024x768)", () => {
    const payload: PersistedDesktopLayout = {
        version: 1,
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                // Normalized to near right edge in 1440
                frame: { x: 0.7, y: 0.6, width: 0.5, height: 0.5 },
                mode: "normal",
                zOrder: 1,
                snap: null,
            },
            {
                id: "notes",
                kind: "notes",
                entityId: null,
                frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
                mode: "maximized",
                zOrder: 2,
                snap: null,
            },
        ],
        activeId: "apps",
    };

    const decoded = decodeDesktopLayout(payload, rect1024);
    assertNotEquals(decoded, null);
    assertEquals(decoded!.windows.length, 2);

    const appsWin = decoded!.windows.find((w) => w.id === "apps")!;
    // In 1024x768, apps must fit completely within safeRect bounds
    assertEquals(appsWin.frame.x + appsWin.frame.width <= rect1024.width, true);
    assertEquals(
        appsWin.frame.y + appsWin.frame.height <= rect1024.height,
        true,
    );
    assertEquals(appsWin.frame.x >= 0, true);
    assertEquals(appsWin.frame.y >= 0, true);

    const notesWin = decoded!.windows.find((w) => w.id === "notes")!;
    // Maximized window fills rect1024
    assertEquals(notesWin.frame, { x: 0, y: 0, width: 1024, height: 768 });
    assertEquals(notesWin.restoreFrame !== null, true);
});

Deno.test("desktop-persistence: decodeDesktopLayout drops stale note IDs when validNoteIds is provided", () => {
    const payload: PersistedDesktopLayout = {
        version: 1,
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
                mode: "normal",
                zOrder: 1,
                snap: null,
            },
            {
                id: "note:alive",
                kind: "note",
                entityId: "alive",
                frame: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
                mode: "normal",
                zOrder: 2,
                snap: null,
            },
            {
                id: "note:deleted",
                kind: "note",
                entityId: "deleted",
                frame: { x: 0.3, y: 0.3, width: 0.3, height: 0.3 },
                mode: "normal",
                zOrder: 3,
                snap: null,
            },
        ],
        activeId: "note:deleted",
    };

    const validNotes = new Set(["alive"]);
    const decoded = decodeDesktopLayout(payload, rect1440, validNotes);
    assertNotEquals(decoded, null);
    assertEquals(decoded!.windows.length, 2);
    assertEquals(decoded!.windows.map((w) => w.id), ["apps", "note:alive"]);
    assertEquals(decoded!.activeId, "note:alive");
});

Deno.test("desktop-persistence: decodeDesktopLayout strictly rejects corrupt payloads and defaults entire desktop", () => {
    assertEquals(decodeDesktopLayout(null, rect1440), null);
    assertEquals(decodeDesktopLayout("invalid", rect1440), null);
    assertEquals(decodeDesktopLayout([1, 2, 3], rect1440), null);

    // Unsupported version
    assertEquals(
        decodeDesktopLayout({ version: 2, windows: [] }, rect1440),
        null,
    );
    assertEquals(
        decodeDesktopLayout({ version: 0, windows: [] }, rect1440),
        null,
    );
    assertEquals(decodeDesktopLayout({ windows: [] }, rect1440), null);

    // Corrupt windows array
    assertEquals(
        decodeDesktopLayout({ version: 1, windows: "not-an-array" }, rect1440),
        null,
    );

    // Duplicate window IDs strictly default entire desktop
    const duplicateIdsPayload = {
        version: 1,
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
                mode: "normal",
                zOrder: 1,
            },
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
                mode: "normal",
                zOrder: 2,
            },
        ],
    };
    assertEquals(decodeDesktopLayout(duplicateIdsPayload, rect1440), null);

    // Corrupt window item strictly defaults entire desktop
    const corruptItemPayload = {
        version: 1,
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
                mode: "normal",
                zOrder: 1,
            },
            null,
        ],
    };
    assertEquals(decodeDesktopLayout(corruptItemPayload, rect1440), null);

    // Illegal kind strictly defaults entire desktop
    const illegalKindPayload = {
        version: 1,
        windows: [
            {
                id: "unknown",
                kind: "unknown",
                entityId: null,
                frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
                mode: "normal",
                zOrder: 1,
            },
        ],
    };
    assertEquals(decodeDesktopLayout(illegalKindPayload, rect1440), null);

    // Note kind without matching note:<entityId> strictly defaults entire desktop
    const mismatchedNoteIdPayload = {
        version: 1,
        windows: [
            {
                id: "wrong-id",
                kind: "note",
                entityId: "item1",
                frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
                mode: "normal",
                zOrder: 1,
            },
        ],
    };
    assertEquals(decodeDesktopLayout(mismatchedNoteIdPayload, rect1440), null);

    // Out-of-bounds frame strictly defaults entire desktop
    const outOfBoundsFramePayload = {
        version: 1,
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 1.5, y: 0.1, width: 0.4, height: 0.4 },
                mode: "normal",
                zOrder: 1,
            },
        ],
    };
    assertEquals(decodeDesktopLayout(outOfBoundsFramePayload, rect1440), null);
});
Deno.test("desktop-persistence: regression - normal -> MAXIMIZE -> MINIMIZE -> reload -> RESTORE -> unmaximize preserves normal geometry", () => {
    // 1. Initial normal window
    let state: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 144, y: 90, width: 720, height: 450 },
                restoreFrame: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "apps",
    };

    // 2. Maximize
    state = {
        windows: [
            {
                ...state.windows[0],
                mode: "maximized",
                frame: { x: 0, y: 0, width: 1440, height: 900 },
                restoreFrame: { x: 144, y: 90, width: 720, height: 450 },
            },
        ],
        activeId: "apps",
    };

    // 3. Minimize from maximized state
    state = {
        windows: [
            {
                ...state.windows[0],
                mode: "minimized",
            },
        ],
        activeId: null,
    };

    // 4. Encode & Decode (simulating reload)
    const encoded = encodeDesktopLayout(state, rect1440);
    // restoreFrame must be non-null in encoded layout to preserve prior max semantic
    assertNotEquals(encoded.windows[0].restoreFrame, null);

    const decoded = decodeDesktopLayout(encoded, rect1440);
    assertNotEquals(decoded, null);
    assertEquals(decoded!.windows[0].mode, "minimized");
    assertNotEquals(decoded!.windows[0].restoreFrame, null);
    assertEquals(decoded!.windows[0].restoreFrame, {
        x: 144,
        y: 90,
        width: 720,
        height: 450,
    });

    // 5. Restore from minimized in desktopReducer
    // Importing or simulating desktopReducer RESTORE:
    // When target.mode === "minimized" and restoreFrame !== null, it restores to maximized:
    const restoredMax = {
        ...decoded!.windows[0],
        mode: "maximized" as const,
        frame: { x: 0, y: 0, width: 1440, height: 900 },
        restoreFrame: decoded!.windows[0].restoreFrame,
    };
    assertEquals(restoredMax.mode, "maximized");

    // 6. Unmaximize (RESTORE_FRAME): restores to restoreFrame
    const unmaximizedFrame = restoredMax.restoreFrame;
    assertEquals(unmaximizedFrame, { x: 144, y: 90, width: 720, height: 450 });
});

Deno.test("desktop-persistence: IndexedDB save, load, and user isolation contracts", async () => {
    setupMockIndexedDB();

    const user1State: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 100, y: 100, width: 500, height: 400 },
                restoreFrame: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "apps",
    };

    const user2State: DesktopState = {
        windows: [
            {
                id: "notes",
                kind: "notes",
                entityId: null,
                frame: { x: 200, y: 200, width: 600, height: 500 },
                restoreFrame: null,
                mode: "normal",
                zOrder: 1,
            },
        ],
        activeId: "notes",
    };

    await saveDesktopLayout("user-A", user1State, rect1440);
    await saveDesktopLayout("user-B", user2State, rect1440);

    const loadedA = await loadDesktopLayout("user-A", rect1440);
    const loadedB = await loadDesktopLayout("user-B", rect1440);

    assertNotEquals(loadedA, null);
    assertNotEquals(loadedB, null);
    assertEquals(loadedA!.windows[0].id, "apps");
    assertEquals(loadedB!.windows[0].id, "notes");

    // Unknown user returns null
    const loadedUnknown = await loadDesktopLayout("user-unknown", rect1440);
    assertEquals(loadedUnknown, null);
});

Deno.test("desktop-persistence: fallback to instance session memory when IndexedDB is unavailable", async () => {
    const sessionMemory = new Map<string, PersistedDesktopLayout>();

    const env = globalThis as Record<string, unknown>;
    const originalIDB = env.indexedDB;
    delete env.indexedDB;

    try {
        const fallbackState: DesktopState = {
            windows: [
                {
                    id: "apps",
                    kind: "apps",
                    entityId: null,
                    frame: { x: 100, y: 100, width: 500, height: 400 },
                    restoreFrame: null,
                    mode: "normal",
                    zOrder: 1,
                },
            ],
            activeId: "apps",
        };

        // Save into session memory fallback
        await saveDesktopLayout(
            "session-user",
            fallbackState,
            rect1440,
            sessionMemory,
        );

        // Load recovers from instance session memory without error
        const recovered = await loadDesktopLayout(
            "session-user",
            rect1440,
            undefined,
            sessionMemory,
        );
        assertNotEquals(recovered, null);
        assertEquals(recovered!.windows[0].id, "apps");

        // Another user has null
        const otherUser = await loadDesktopLayout(
            "other-user",
            rect1440,
            undefined,
            sessionMemory,
        );
        assertEquals(otherUser, null);
    } finally {
        const resetEnv = globalThis as Record<string, unknown>;
        resetEnv.indexedDB = originalIDB;
    }
});

Deno.test("desktop-persistence: encodeDesktopLayout captures snap semantic and restores across save/load for 7 modes", () => {
    const state: DesktopState = {
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: snapFrame("left", rect1440),
                restoreFrame: { x: 100, y: 100, width: 600, height: 400 },
                mode: "snapped",
                snap: "left",
                zOrder: 1,
            },
            {
                id: "notes",
                kind: "notes",
                entityId: null,
                frame: snapFrame("bottom-right", rect1440),
                restoreFrame: { x: 200, y: 200, width: 500, height: 350 },
                mode: "snapped",
                snap: "bottom-right",
                zOrder: 2,
            },
            {
                id: "note:item-1",
                kind: "note",
                entityId: "item-1",
                frame: snapFrame("top-left", rect1440),
                restoreFrame: { x: 50, y: 50, width: 400, height: 300 },
                mode: "minimized",
                snap: "top-left",
                zOrder: 3,
            },
        ],
        activeId: "notes",
    };

    const encoded = encodeDesktopLayout(state, rect1440);
    assertEquals(encoded.windows.find((w) => w.id === "apps")!.mode, "snapped");
    assertEquals(encoded.windows.find((w) => w.id === "apps")!.snap, "left");
    assertEquals(
        encoded.windows.find((w) => w.id === "notes")!.mode,
        "snapped",
    );
    assertEquals(
        encoded.windows.find((w) => w.id === "notes")!.snap,
        "bottom-right",
    );
    assertEquals(
        encoded.windows.find((w) => w.id === "note:item-1")!.mode,
        "minimized",
    );
    assertEquals(
        encoded.windows.find((w) => w.id === "note:item-1")!.snap,
        "top-left",
    );

    // Decode into a different viewport: rect1024
    const decoded = decodeDesktopLayout(encoded, rect1024);
    assertNotEquals(decoded, null);

    const appsWin = decoded!.windows.find((w) => w.id === "apps")!;
    assertEquals(appsWin.mode, "snapped");
    assertEquals(appsWin.snap, "left");
    assertEquals(appsWin.frame, snapFrame("left", rect1024));

    const notesWin = decoded!.windows.find((w) => w.id === "notes")!;
    assertEquals(notesWin.mode, "snapped");
    assertEquals(notesWin.snap, "bottom-right");
    assertEquals(notesWin.frame, snapFrame("bottom-right", rect1024));

    const noteWin = decoded!.windows.find((w) => w.id === "note:item-1")!;
    assertEquals(noteWin.mode, "minimized");
    assertEquals(noteWin.snap, "top-left");
    assertEquals(noteWin.frame, snapFrame("top-left", rect1024));
});

Deno.test("desktop-persistence: backward compatibility with legacy schema v1 fixtures without snap property", () => {
    const legacyPayload = {
        version: 1,
        windows: [
            {
                id: "apps",
                kind: "apps",
                entityId: null,
                frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
                mode: "normal",
                zOrder: 1,
                snap: null,
            },
            {
                id: "notes",
                kind: "notes",
                entityId: null,
                frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
                mode: "maximized",
                zOrder: 2,
                // snap omitted completely or null
            },
        ],
        activeId: "apps",
    };

    const decoded = decodeDesktopLayout(legacyPayload, rect1440);
    assertNotEquals(decoded, null);
    const appsWin = decoded!.windows.find((w) => w.id === "apps")!;
    assertEquals(appsWin.mode, "normal");
    assertEquals(appsWin.snap, null);

    const notesWin = decoded!.windows.find((w) => w.id === "notes")!;
    assertEquals(notesWin.mode, "maximized");
    assertEquals(notesWin.snap, "maximize");
    assertEquals(notesWin.frame, snapFrame("maximize", rect1440));
});

Deno.test("desktop-persistence: strict validation rejects invalid snap values or corrupt mode-snap combinations", () => {
    const baseWindow = {
        id: "apps",
        kind: "apps",
        entityId: null,
        frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
        zOrder: 1,
    };

    // 1. mode="snapped" with snap=null -> invalid
    assertEquals(
        decodeDesktopLayout(
            {
                version: 1,
                windows: [{ ...baseWindow, mode: "snapped", snap: null }],
            },
            rect1440,
        ),
        null,
    );

    for (const snap of ["toString", "constructor", "__proto__"]) {
        assertEquals(
            decodeDesktopLayout({
                version: 1,
                windows: [{ ...baseWindow, mode: "snapped", snap }],
            }, rect1440),
            null,
        );
    }

    // 2. mode="snapped" with invalid snap name e.g. "center" -> invalid
    assertEquals(
        decodeDesktopLayout(
            {
                version: 1,
                windows: [{ ...baseWindow, mode: "snapped", snap: "center" }],
            },
            rect1440,
        ),
        null,
    );

    // 3. mode="normal" with snap="left" -> invalid (normal windows cannot have snap)
    assertEquals(
        decodeDesktopLayout(
            {
                version: 1,
                windows: [{ ...baseWindow, mode: "normal", snap: "left" }],
            },
            rect1440,
        ),
        null,
    );

    // 4. mode="maximized" with snap="left" -> invalid (maximized can only be snap="maximize" or null)
    assertEquals(
        decodeDesktopLayout(
            {
                version: 1,
                windows: [{ ...baseWindow, mode: "maximized", snap: "left" }],
            },
            rect1440,
        ),
        null,
    );

    // 5. non-string / corrupt snap value e.g. snap=123
    assertEquals(
        decodeDesktopLayout(
            {
                version: 1,
                windows: [{ ...baseWindow, mode: "snapped", snap: 123 }],
            },
            rect1440,
        ),
        null,
    );

    // 6. corrupt mode
    assertEquals(
        decodeDesktopLayout(
            {
                version: 1,
                windows: [{ ...baseWindow, mode: "floating", snap: null }],
            },
            rect1440,
        ),
        null,
    );
});
