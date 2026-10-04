import { assertEquals, assertNotEquals } from "@std/assert";
import { type SafeRect, snapFrame } from "./desktop-geometry.ts";
import {
    desktopReducer,
    type DesktopState,
    initialDesktopState,
} from "./desktop-state.ts";

const sampleRect: SafeRect = { x: 0, y: 0, width: 1440, height: 900 };

Deno.test("desktop-state: OPEN creates window, stacks on top, and activates", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "app-1",
        kind: "apps",
        entityId: "app-entry-1",
        rect: sampleRect,
    });

    assertEquals(state.windows.length, 1);
    assertEquals(state.activeId, "app-1");
    const win1 = state.windows[0];
    assertEquals(win1.id, "app-1");
    assertEquals(win1.kind, "apps");
    assertEquals(win1.entityId, "app-entry-1");
    assertEquals(win1.mode, "normal");
    assertEquals(win1.restoreFrame, null);
    assertEquals(win1.zOrder, 1);
    assertEquals(win1.frame.width, 760);

    // Open second window of another kind
    state = desktopReducer(state, {
        type: "OPEN",
        id: "note-1",
        kind: "note",
        rect: sampleRect,
    });

    assertEquals(state.windows.length, 2);
    assertEquals(state.activeId, "note-1");
    const win2 = state.windows.find((w) => w.id === "note-1")!;
    assertEquals(win2.zOrder, 2);
    assertEquals(win2.entityId, null);

    // Re-opening an existing window focuses it and keeps frame
    const originalFrame = { ...win1.frame };
    state = desktopReducer(state, {
        type: "OPEN",
        id: "app-1",
        kind: "apps",
        rect: sampleRect,
    });

    assertEquals(state.windows.length, 2);
    assertEquals(state.activeId, "app-1");
    const win1Refocused = state.windows.find((w) => w.id === "app-1")!;
    assertEquals(win1Refocused.frame, originalFrame);
    // Bounded z-order: with 2 windows, topmost is 2, other is 1
    assertEquals(win1Refocused.zOrder, 2);
    assertEquals(state.windows.find((w) => w.id === "note-1")!.zOrder, 1);
});

Deno.test("desktop-state: CLOSE removes window and falls back activeId to topmost visible window", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w2",
        kind: "notes",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w3",
        kind: "note",
        rect: sampleRect,
    });

    assertEquals(state.activeId, "w3");

    // Close active window w3 -> focus transfers to w2 (highest zOrder remaining)
    state = desktopReducer(state, { type: "CLOSE", id: "w3" });
    assertEquals(state.windows.length, 2);
    assertEquals(state.windows.some((w) => w.id === "w3"), false);
    assertEquals(state.activeId, "w2");

    // Close inactive window w1 -> activeId stays w2
    state = desktopReducer(state, { type: "CLOSE", id: "w1" });
    assertEquals(state.windows.length, 1);
    assertEquals(state.activeId, "w2");

    // Close remaining window -> activeId becomes null
    state = desktopReducer(state, { type: "CLOSE", id: "w2" });
    assertEquals(state.windows.length, 0);
    assertEquals(state.activeId, null);
});

Deno.test("desktop-state: FOCUS elevates stacking and updates activeId", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w2",
        kind: "notes",
        rect: sampleRect,
    });

    assertEquals(state.activeId, "w2");
    assertEquals(state.windows.find((w) => w.id === "w1")!.zOrder, 1);
    assertEquals(state.windows.find((w) => w.id === "w2")!.zOrder, 2);

    // Focus w1 -> zOrder becomes 2 (topmost of 2 windows), w2 becomes 1
    state = desktopReducer(state, { type: "FOCUS", id: "w1" });
    assertEquals(state.activeId, "w1");
    assertEquals(state.windows.find((w) => w.id === "w1")!.zOrder, 2);
    assertEquals(state.windows.find((w) => w.id === "w2")!.zOrder, 1);

    // Focusing already-focused topmost window is a no-op
    state = desktopReducer(state, { type: "FOCUS", id: "w1" });
    assertEquals(state.activeId, "w1");
    assertEquals(state.windows.find((w) => w.id === "w1")!.zOrder, 2);

    // FOCUS on a minimized window must NOT make invisible window active
    state = desktopReducer(state, { type: "MINIMIZE", id: "w2" });
    assertEquals(state.activeId, "w1");
    state = desktopReducer(state, { type: "FOCUS", id: "w2" });
    // Still w1! w2 is minimized so focus is rejected
    assertEquals(state.activeId, "w1");
    assertEquals(state.windows.find((w) => w.id === "w2")!.mode, "minimized");
});

Deno.test("desktop-state: NORMALIZE compresses z-orders to bounded 1..N preserving stacking", () => {
    // Construct state with arbitrary/inflated z-orders
    const inflatedState: DesktopState = {
        windows: [
            {
                id: "w1",
                kind: "apps",
                entityId: null,
                frame: { x: 0, y: 0, width: 760, height: 700 },
                restoreFrame: null,
                mode: "normal",
                zOrder: 50,
            },
            {
                id: "w2",
                kind: "notes",
                entityId: null,
                frame: { x: 0, y: 0, width: 640, height: 600 },
                restoreFrame: null,
                mode: "normal",
                zOrder: 500,
            },
            {
                id: "w3",
                kind: "note",
                entityId: null,
                frame: { x: 0, y: 0, width: 560, height: 500 },
                restoreFrame: null,
                mode: "normal",
                zOrder: 12,
            },
        ],
        activeId: "w2",
    };

    const normalized = desktopReducer(inflatedState, { type: "NORMALIZE" });
    // Original order by zOrder: w3 (12) < w1 (50) < w2 (500)
    // Normalized: w3 -> 1, w1 -> 2, w2 -> 3
    assertEquals(normalized.windows.find((w) => w.id === "w3")!.zOrder, 1);
    assertEquals(normalized.windows.find((w) => w.id === "w1")!.zOrder, 2);
    assertEquals(normalized.windows.find((w) => w.id === "w2")!.zOrder, 3);
    assertEquals(normalized.activeId, "w2");
});

Deno.test("desktop-state: MAXIMIZE saves restoreFrame, and RESTORE_FRAME clamps restored frame", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });

    const initialFrame = state.windows[0].frame;

    // Maximize window
    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "w1",
        rect: sampleRect,
    });

    const maximizedWin = state.windows[0];
    assertEquals(maximizedWin.mode, "maximized");
    assertEquals(maximizedWin.restoreFrame, initialFrame);
    assertEquals(maximizedWin.frame, {
        x: 0,
        y: 0,
        width: sampleRect.width,
        height: sampleRect.height,
    });

    // Restore frame in a smaller viewport rect -> clamps restoreFrame
    const smallerRect: SafeRect = { x: 0, y: 0, width: 600, height: 500 };
    state = desktopReducer(state, {
        type: "RESTORE_FRAME",
        id: "w1",
        rect: smallerRect,
    });

    const restoredWin = state.windows[0];
    assertEquals(restoredWin.mode, "normal");
    assertEquals(restoredWin.restoreFrame, null);
    // Original width was 760, but smallerRect width is 600 -> clamped to 600
    assertEquals(restoredWin.frame.width, 600);
    assertEquals(restoredWin.frame.x, 0);
});

Deno.test("desktop-state: MINIMIZE transfers focus, and RESTORE preserves prior maximized state", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w2",
        kind: "notes",
        rect: sampleRect,
    });

    // 1. Minimize normal window w2 -> focus transfers to w1
    state = desktopReducer(state, { type: "MINIMIZE", id: "w2" });
    assertEquals(state.windows.find((w) => w.id === "w2")!.mode, "minimized");
    assertEquals(state.activeId, "w1");

    // Restoring normal window w2 restores it to "normal" mode and activates it
    state = desktopReducer(state, {
        type: "RESTORE",
        id: "w2",
        rect: sampleRect,
    });
    assertEquals(state.windows.find((w) => w.id === "w2")!.mode, "normal");
    assertEquals(state.activeId, "w2");

    // 2. Maximize w2
    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "w2",
        rect: sampleRect,
    });
    assertEquals(state.windows.find((w) => w.id === "w2")!.mode, "maximized");
    const preMinRestoreFrame =
        state.windows.find((w) => w.id === "w2")!.restoreFrame;
    assertNotEquals(preMinRestoreFrame, null);

    // Minimize maximized w2
    state = desktopReducer(state, { type: "MINIMIZE", id: "w2" });
    assertEquals(state.windows.find((w) => w.id === "w2")!.mode, "minimized");
    assertEquals(state.activeId, "w1"); // Focus transfers to w1

    // Restore minimized window that was previously maximized:
    // Must preserve prior max state!
    state = desktopReducer(state, {
        type: "RESTORE",
        id: "w2",
        rect: sampleRect,
    });
    const restoredFromMax = state.windows.find((w) => w.id === "w2")!;
    assertEquals(restoredFromMax.mode, "maximized");
    assertEquals(restoredFromMax.restoreFrame, preMinRestoreFrame);
    assertEquals(state.activeId, "w2");
});

Deno.test("desktop-state: MOVE and RESIZE update frame clamped and un-maximize", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });

    // Move w1
    const movedFrame = { x: 50, y: 80, width: 760, height: 700 };
    state = desktopReducer(state, {
        type: "MOVE",
        id: "w1",
        frame: movedFrame,
        rect: sampleRect,
    });
    assertEquals(state.windows[0].frame, movedFrame);

    // Move with out-of-bounds coordinates clamps into safe rect
    state = desktopReducer(state, {
        type: "MOVE",
        id: "w1",
        frame: { x: 2000, y: 2000, width: 760, height: 700 },
        rect: sampleRect,
    });
    assertEquals(state.windows[0].frame.x, sampleRect.width - 760);
    assertEquals(state.windows[0].frame.y, sampleRect.height - 700);

    // Maximize then MOVE un-maximizes
    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "w1",
        rect: sampleRect,
    });
    assertEquals(state.windows[0].mode, "maximized");
    state = desktopReducer(state, {
        type: "MOVE",
        id: "w1",
        frame: { x: 100, y: 100, width: 760, height: 700 },
        rect: sampleRect,
    });
    assertEquals(state.windows[0].mode, "normal");
    assertEquals(state.windows[0].restoreFrame, null);

    // RESIZE updates frame and clamps
    state = desktopReducer(state, {
        type: "RESIZE",
        id: "w1",
        frame: { x: 100, y: 100, width: 800, height: 650 },
        rect: sampleRect,
    });
    assertEquals(state.windows[0].frame, {
        x: 100,
        y: 100,
        width: 800,
        height: 650,
    });
});

Deno.test("desktop-state: CLAMP updates all windows when safe rect changes", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w-normal",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w-max",
        kind: "notes",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "w-max",
        rect: sampleRect,
    });

    // Shrink viewport
    const shrunkRect: SafeRect = { x: 0, y: 0, width: 700, height: 500 };
    state = desktopReducer(state, {
        type: "CLAMP",
        rect: shrunkRect,
    });

    const normalWin = state.windows.find((w) => w.id === "w-normal")!;
    const maxWin = state.windows.find((w) => w.id === "w-max")!;

    // Normal window clamped inside shrunk safe rect
    assertEquals(
        normalWin.frame.x + normalWin.frame.width <= shrunkRect.width,
        true,
    );
    assertEquals(
        normalWin.frame.y + normalWin.frame.height <= shrunkRect.height,
        true,
    );

    // Maximized window updated to exactly fill shrunk safe rect
    assertEquals(maxWin.frame, {
        x: 0,
        y: 0,
        width: shrunkRect.width,
        height: shrunkRect.height,
    });
});

Deno.test("desktop-state: regression - repeated elevations stay strictly bounded 1..N and preserve relative stacking", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w2",
        kind: "notes",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w3",
        kind: "note",
        rect: sampleRect,
    });

    assertEquals(state.windows.map((w) => w.zOrder).sort(), [1, 2, 3]);

    for (let i = 0; i < 20; i++) {
        // Elevate w1 via OPEN existing
        state = desktopReducer(state, {
            type: "OPEN",
            id: "w1",
            kind: "apps",
            rect: sampleRect,
        });
        assertEquals(state.activeId, "w1");
        assertEquals(state.windows.find((w) => w.id === "w1")!.zOrder, 3);
        assertEquals(state.windows.map((w) => w.zOrder).sort(), [1, 2, 3]);

        // Maximize w2
        state = desktopReducer(state, {
            type: "MAXIMIZE",
            id: "w2",
            rect: sampleRect,
        });
        assertEquals(state.activeId, "w2");
        assertEquals(state.windows.find((w) => w.id === "w2")!.zOrder, 3);
        assertEquals(state.windows.map((w) => w.zOrder).sort(), [1, 2, 3]);

        // Minimize and Restore w3
        state = desktopReducer(state, { type: "MINIMIZE", id: "w3" });
        state = desktopReducer(state, {
            type: "RESTORE",
            id: "w3",
            rect: sampleRect,
        });
        assertEquals(state.activeId, "w3");
        assertEquals(state.windows.find((w) => w.id === "w3")!.zOrder, 3);
        assertEquals(state.windows.map((w) => w.zOrder).sort(), [1, 2, 3]);

        // Restore_frame w2
        state = desktopReducer(state, {
            type: "RESTORE_FRAME",
            id: "w2",
            rect: sampleRect,
        });
        assertEquals(state.activeId, "w2");
        assertEquals(state.windows.find((w) => w.id === "w2")!.zOrder, 3);
        assertEquals(state.windows.map((w) => w.zOrder).sort(), [1, 2, 3]);

        // Relative stacking check: w2 is top (3), w1 and w3 occupy 1 and 2
        const z1 = state.windows.find((w) => w.id === "w1")!.zOrder;
        const z3 = state.windows.find((w) => w.id === "w3")!.zOrder;
        assertEquals(Math.max(z1, z3), 2);
        assertEquals(Math.min(z1, z3), 1);
    }
});

Deno.test("desktop-state: HYDRATE normalizes z-orders and validates activeId", () => {
    const hydrated = desktopReducer(initialDesktopState, {
        type: "HYDRATE",
        state: {
            windows: [
                {
                    id: "w1",
                    kind: "apps",
                    entityId: null,
                    frame: { x: 0, y: 0, width: 600, height: 400 },
                    restoreFrame: null,
                    mode: "normal",
                    zOrder: 10,
                },
                {
                    id: "w2",
                    kind: "notes",
                    entityId: null,
                    frame: { x: 50, y: 50, width: 600, height: 400 },
                    restoreFrame: null,
                    mode: "minimized",
                    zOrder: 20,
                },
            ],
            activeId: "w2", // minimized, should fall back to w1
        },
    });
    assertEquals(hydrated.windows.length, 2);
    assertEquals(hydrated.windows.find((w) => w.id === "w1")!.zOrder, 1);
    assertEquals(hydrated.windows.find((w) => w.id === "w2")!.zOrder, 2);
    assertEquals(hydrated.activeId, "w1");
});

Deno.test("desktop-state: RESET clears all windows and activeId", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    assertEquals(state.windows.length, 1);
    state = desktopReducer(state, { type: "RESET" });
    assertEquals(state.windows.length, 0);
    assertEquals(state.activeId, null);
});

Deno.test("desktop-state: PRUNE_STALE_NOTES closes deleted note windows and preserves other windows", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "apps",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "note:note-1",
        kind: "note",
        entityId: "note-1",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "note:note-2",
        kind: "note",
        entityId: "note-2",
        rect: sampleRect,
    });
    assertEquals(state.windows.length, 3);
    assertEquals(state.activeId, "note:note-2");

    // Prune stale notes: only note-1 is valid
    state = desktopReducer(state, {
        type: "PRUNE_STALE_NOTES",
        validNoteIds: ["note-1"],
    });
    assertEquals(state.windows.length, 2);
    assertEquals(state.windows.map((w) => w.id), ["apps", "note:note-1"]);
    assertEquals(state.activeId, "note:note-1");

    // Prune all notes
    state = desktopReducer(state, {
        type: "PRUNE_STALE_NOTES",
        validNoteIds: [],
    });
    assertEquals(state.windows.length, 1);
    assertEquals(state.windows[0].id, "apps");
    assertEquals(state.activeId, "apps");
});

Deno.test("desktop-state: SNAP action handles 7 modes, captures restoreFrame from normal, and does not overwrite restoreFrame on snap change", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    const initialNormalFrame = state.windows[0].frame;
    assertEquals(state.windows[0].snap, null);

    // 1. Snap to left
    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "left",
        rect: sampleRect,
    });
    const leftWin = state.windows[0];
    assertEquals(leftWin.mode, "snapped");
    assertEquals(leftWin.snap, "left");
    assertEquals(leftWin.frame, snapFrame("left", sampleRect));
    assertEquals(leftWin.restoreFrame, initialNormalFrame);

    // 2. Switch snap to top-right -> MUST NOT overwrite restoreFrame with the left snap frame
    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "top-right",
        rect: sampleRect,
    });
    const trWin = state.windows[0];
    assertEquals(trWin.mode, "snapped");
    assertEquals(trWin.snap, "top-right");
    assertEquals(trWin.frame, snapFrame("top-right", sampleRect));
    assertEquals(trWin.restoreFrame, initialNormalFrame);

    // 3. Switch snap to maximize mode via SNAP action
    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "maximize",
        rect: sampleRect,
    });
    const maxWin = state.windows[0];
    assertEquals(maxWin.mode, "maximized");
    assertEquals(maxWin.snap, "maximize");
    assertEquals(maxWin.frame, snapFrame("maximize", sampleRect));
    assertEquals(maxWin.restoreFrame, initialNormalFrame);
});

Deno.test("desktop-state: MAXIMIZE sets snap='maximize' and preserves existing restoreFrame from snapped mode", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    const initialNormalFrame = state.windows[0].frame;

    // Snap to bottom-left first
    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "bottom-left",
        rect: sampleRect,
    });
    assertEquals(state.windows[0].restoreFrame, initialNormalFrame);

    // Dispatch MAXIMIZE action
    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "w1",
        rect: sampleRect,
    });
    const maxWin = state.windows[0];
    assertEquals(maxWin.mode, "maximized");
    assertEquals(maxWin.snap, "maximize");
    assertEquals(maxWin.restoreFrame, initialNormalFrame);
    assertEquals(maxWin.frame, snapFrame("maximize", sampleRect));
});

Deno.test("desktop-state: RESTORE on snapped window restores to normal mode and clears snap and restoreFrame", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    const initialNormalFrame = state.windows[0].frame;

    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "right",
        rect: sampleRect,
    });
    assertEquals(state.windows[0].mode, "snapped");

    // RESTORE on non-minimized snapped window
    state = desktopReducer(state, {
        type: "RESTORE",
        id: "w1",
        rect: sampleRect,
    });
    const restoredWin = state.windows[0];
    assertEquals(restoredWin.mode, "normal");
    assertEquals(restoredWin.snap, null);
    assertEquals(restoredWin.restoreFrame, null);
    assertEquals(restoredWin.frame, initialNormalFrame);
});

Deno.test("desktop-state: MINIMIZE on snapped window retains snap; RESTORE recovers original snapped semantic", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w2",
        kind: "notes",
        rect: sampleRect,
    });
    const initialNormalFrame = state.windows.find((w) => w.id === "w2")!.frame;

    // Snap w2 to bottom-right
    state = desktopReducer(state, {
        type: "SNAP",
        id: "w2",
        snap: "bottom-right",
        rect: sampleRect,
    });
    assertEquals(state.windows.find((w) => w.id === "w2")!.mode, "snapped");

    // Minimize w2 -> focus transfers to w1
    state = desktopReducer(state, { type: "MINIMIZE", id: "w2" });
    assertEquals(state.windows.find((w) => w.id === "w2")!.mode, "minimized");
    assertEquals(
        state.windows.find((w) => w.id === "w2")!.snap,
        "bottom-right",
    );
    assertEquals(
        state.windows.find((w) => w.id === "w2")!.restoreFrame,
        initialNormalFrame,
    );
    assertEquals(state.activeId, "w1");

    // Restore w2 -> recovers original snapped semantic!
    state = desktopReducer(state, {
        type: "RESTORE",
        id: "w2",
        rect: sampleRect,
    });
    const restoredSnap = state.windows.find((w) => w.id === "w2")!;
    assertEquals(restoredSnap.mode, "snapped");
    assertEquals(restoredSnap.snap, "bottom-right");
    assertEquals(restoredSnap.frame, snapFrame("bottom-right", sampleRect));
    assertEquals(restoredSnap.restoreFrame, initialNormalFrame);
    assertEquals(state.activeId, "w2");
});

Deno.test("desktop-state: RESTORE_FRAME on snapped window restores to normal mode and clears snap", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });
    const initialNormalFrame = state.windows[0].frame;

    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "top-left",
        rect: sampleRect,
    });
    assertEquals(state.windows[0].mode, "snapped");

    state = desktopReducer(state, {
        type: "RESTORE_FRAME",
        id: "w1",
        rect: sampleRect,
    });
    const restoredWin = state.windows[0];
    assertEquals(restoredWin.mode, "normal");
    assertEquals(restoredWin.snap, null);
    assertEquals(restoredWin.restoreFrame, null);
    assertEquals(restoredWin.frame, initialNormalFrame);
});

Deno.test("desktop-state: MOVE and RESIZE clear snap and restoreFrame, resetting to normal mode", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: sampleRect,
    });

    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "left",
        rect: sampleRect,
    });
    assertEquals(state.windows[0].mode, "snapped");
    assertEquals(state.windows[0].snap, "left");

    // Move window
    const movedFrame = { x: 50, y: 50, width: 600, height: 400 };
    state = desktopReducer(state, {
        type: "MOVE",
        id: "w1",
        frame: movedFrame,
        rect: sampleRect,
    });
    assertEquals(state.windows[0].mode, "normal");
    assertEquals(state.windows[0].snap, null);
    assertEquals(state.windows[0].restoreFrame, null);

    // Re-snap to right
    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "right",
        rect: sampleRect,
    });
    assertEquals(state.windows[0].mode, "snapped");

    // Resize window
    const resizedFrame = { x: 720, y: 0, width: 500, height: 600 };
    state = desktopReducer(state, {
        type: "RESIZE",
        id: "w1",
        frame: resizedFrame,
        rect: sampleRect,
    });
    assertEquals(state.windows[0].mode, "normal");
    assertEquals(state.windows[0].snap, null);
    assertEquals(state.windows[0].restoreFrame, null);
});

Deno.test("desktop-state: CLAMP recomputes frame according to snap semantic on viewport resize", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w-snapped",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w-max",
        kind: "notes",
        rect: sampleRect,
    });
    const snappedNormalFrame =
        state.windows.find((w) => w.id === "w-snapped")!.frame;

    state = desktopReducer(state, {
        type: "SNAP",
        id: "w-snapped",
        snap: "right",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "w-max",
        rect: sampleRect,
    });

    // Resize safeRect to 1200 x 800
    const newRect: SafeRect = { x: 0, y: 0, width: 1200, height: 800 };
    state = desktopReducer(state, {
        type: "CLAMP",
        rect: newRect,
    });

    const winSnapped = state.windows.find((w) => w.id === "w-snapped")!;
    assertEquals(winSnapped.mode, "snapped");
    assertEquals(winSnapped.snap, "right");
    assertEquals(winSnapped.frame, snapFrame("right", newRect)); // (600, 0, 600, 800)
    // restoreFrame was clamped to newRect
    assertEquals(winSnapped.restoreFrame, { ...snappedNormalFrame, y: 98 });

    const winMax = state.windows.find((w) => w.id === "w-max")!;
    assertEquals(winMax.mode, "maximized");
    assertEquals(winMax.snap, "maximize");
    assertEquals(winMax.frame, snapFrame("maximize", newRect)); // (0, 0, 1200, 800)
});

Deno.test("desktop-state: regression - full Snap lifecycle (normal -> snap -> switch snap -> minimize -> resize -> restore -> un-snap -> maximize -> restore_frame)", () => {
    const r1440: SafeRect = { x: 0, y: 0, width: 1440, height: 900 };
    const r1024: SafeRect = { x: 0, y: 0, width: 1024, height: 768 };

    // 1. Initial normal window
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: r1440,
    });
    const initialFrame = state.windows[0].frame;

    // 2. Snap to "left"
    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "left",
        rect: r1440,
    });
    assertEquals(state.windows[0].mode, "snapped");
    assertEquals(state.windows[0].snap, "left");
    assertEquals(state.windows[0].restoreFrame, initialFrame);

    // 3. Switch snap to "bottom-right" (MUST preserve initial normal restoreFrame)
    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "bottom-right",
        rect: r1440,
    });
    assertEquals(state.windows[0].mode, "snapped");
    assertEquals(state.windows[0].snap, "bottom-right");
    assertEquals(state.windows[0].restoreFrame, initialFrame);

    // 4. Minimize
    state = desktopReducer(state, { type: "MINIMIZE", id: "w1" });
    assertEquals(state.windows[0].mode, "minimized");
    assertEquals(state.windows[0].snap, "bottom-right");
    assertEquals(state.windows[0].restoreFrame, initialFrame);

    // 5. Viewport resize to 1024x768 while minimized
    state = desktopReducer(state, { type: "CLAMP", rect: r1024 });
    assertEquals(state.windows[0].mode, "minimized");
    assertEquals(state.windows[0].snap, "bottom-right");
    assertEquals(state.windows[0].frame, snapFrame("bottom-right", r1024));

    // 6. Restore from minimized: recovers snapped semantic in new resolution!
    state = desktopReducer(state, { type: "RESTORE", id: "w1", rect: r1024 });
    assertEquals(state.windows[0].mode, "snapped");
    assertEquals(state.windows[0].snap, "bottom-right");
    assertEquals(state.windows[0].frame, snapFrame("bottom-right", r1024));
    assertNotEquals(state.windows[0].restoreFrame, null);

    // 7. Non-minimized RESTORE: restores to normal mode with restoreFrame
    state = desktopReducer(state, { type: "RESTORE", id: "w1", rect: r1024 });
    assertEquals(state.windows[0].mode, "normal");
    assertEquals(state.windows[0].snap, null);
    assertEquals(state.windows[0].restoreFrame, null);

    // 8. Maximize window
    state = desktopReducer(state, { type: "MAXIMIZE", id: "w1", rect: r1024 });
    assertEquals(state.windows[0].mode, "maximized");
    assertEquals(state.windows[0].snap, "maximize");

    // 9. RESTORE_FRAME returns to normal mode
    state = desktopReducer(state, {
        type: "RESTORE_FRAME",
        id: "w1",
        rect: r1024,
    });
    assertEquals(state.windows[0].mode, "normal");
    assertEquals(state.windows[0].snap, null);
    assertEquals(state.windows[0].restoreFrame, null);
});
