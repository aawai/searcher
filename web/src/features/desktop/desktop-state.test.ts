import { assertEquals, assertNotEquals } from "@std/assert";
import {
    desktopGeometry,
    type Frame,
    frameBasisForGeometry,
    resolveWindowPresentationFrame,
    snapFrame,
    type SnapMode,
    type WindowKind,
} from "./desktop-geometry.ts";
import {
    desktopReducer,
    type DesktopState,
    type DesktopWindowState,
    initialDesktopState,
    type WindowMode,
} from "./desktop-state.ts";

const sampleRect = desktopGeometry(1440, 900, 64, 820, 16, 48);

function makeWindow(
    id: string,
    kind: WindowKind,
    frame: Frame,
    zOrder: number,
    options: {
        mode?: WindowMode;
        snap?: SnapMode | null;
        restoreFrame?: Frame | null;
    } = {},
): DesktopWindowState {
    const restoreFrame = options.restoreFrame ?? null;
    return {
        id,
        kind,
        entityId: null,
        frame,
        frameBasis: frameBasisForGeometry(sampleRect),
        restoreFrame,
        restoreFrameBasis: restoreFrame
            ? frameBasisForGeometry(sampleRect)
            : null,
        mode: options.mode ?? "normal",
        zOrder,
        snap: options.snap ?? null,
    };
}

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
    assertEquals(win1.frameBasis, frameBasisForGeometry(sampleRect));
    assertEquals(win1.restoreFrameBasis, null);
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
    assertEquals(win1Refocused.frameBasis, win1.frameBasis);
    assertEquals(win1Refocused.restoreFrameBasis, null);
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
        type: "SNAP",
        id: "w1",
        snap: "left",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w2",
        kind: "notes",
        rect: sampleRect,
    });

    const geometryBeforeFocus = state.windows.map((window) => ({
        id: window.id,
        frame: window.frame,
        frameBasis: window.frameBasis,
        restoreFrame: window.restoreFrame,
        restoreFrameBasis: window.restoreFrameBasis,
        mode: window.mode,
        snap: window.snap,
    }));
    assertEquals(state.activeId, "w2");
    assertEquals(state.windows.find((w) => w.id === "w1")!.zOrder, 1);
    assertEquals(state.windows.find((w) => w.id === "w2")!.zOrder, 2);

    // Focus w1 -> zOrder becomes 2 (topmost of 2 windows), w2 becomes 1
    state = desktopReducer(state, { type: "FOCUS", id: "w1" });
    assertEquals(state.activeId, "w1");
    assertEquals(state.windows.find((w) => w.id === "w1")!.zOrder, 2);
    assertEquals(state.windows.find((w) => w.id === "w2")!.zOrder, 1);
    assertEquals(
        state.windows.map((window) => ({
            id: window.id,
            frame: window.frame,
            frameBasis: window.frameBasis,
            restoreFrame: window.restoreFrame,
            restoreFrameBasis: window.restoreFrameBasis,
            mode: window.mode,
            snap: window.snap,
        })),
        geometryBeforeFocus,
    );

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
            makeWindow("w1", "apps", {
                x: 0,
                y: 0,
                width: 760,
                height: 700,
            }, 50),
            makeWindow(
                "w2",
                "notes",
                {
                    x: 0,
                    y: 0,
                    width: 640,
                    height: 600,
                },
                500,
                {
                    mode: "maximized",
                    snap: "maximize",
                    restoreFrame: { x: 50, y: 50, width: 500, height: 400 },
                },
            ),
            makeWindow("w3", "note", {
                x: 0,
                y: 0,
                width: 560,
                height: 500,
            }, 12),
        ],
        activeId: "w2",
    };

    const geometryBeforeNormalize = inflatedState.windows.map((window) => ({
        id: window.id,
        frame: window.frame,
        frameBasis: window.frameBasis,
        restoreFrame: window.restoreFrame,
        restoreFrameBasis: window.restoreFrameBasis,
        mode: window.mode,
        snap: window.snap,
    }));
    const normalized = desktopReducer(inflatedState, { type: "NORMALIZE" });
    // Original order by zOrder: w3 (12) < w1 (50) < w2 (500)
    // Normalized: w3 -> 1, w1 -> 2, w2 -> 3
    assertEquals(normalized.windows.find((w) => w.id === "w3")!.zOrder, 1);
    assertEquals(normalized.windows.find((w) => w.id === "w1")!.zOrder, 2);
    assertEquals(normalized.windows.find((w) => w.id === "w2")!.zOrder, 3);
    assertEquals(normalized.activeId, "w2");
    assertEquals(
        normalized.windows.map((window) => ({
            id: window.id,
            frame: window.frame,
            frameBasis: window.frameBasis,
            restoreFrame: window.restoreFrame,
            restoreFrameBasis: window.restoreFrameBasis,
            mode: window.mode,
            snap: window.snap,
        })),
        geometryBeforeNormalize,
    );
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
    assertEquals(maximizedWin.frameBasis, frameBasisForGeometry(sampleRect));
    assertEquals(
        maximizedWin.restoreFrameBasis,
        frameBasisForGeometry(sampleRect),
    );
    assertEquals(
        maximizedWin.frame,
        snapFrame("maximize", sampleRect.workRect),
    );

    // Restore frame in a smaller viewport rect -> clamps restoreFrame
    const smallerRect = desktopGeometry(600, 500, 48, 452, 16, 48, 0);
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
    assertEquals(restoredWin.frameBasis, frameBasisForGeometry(smallerRect));
    assertEquals(restoredWin.restoreFrameBasis, null);
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
    const normalBeforeMinimize = state.windows.find((w) => w.id === "w2")!;
    state = desktopReducer(state, { type: "MINIMIZE", id: "w2" });
    assertEquals(state.windows.find((w) => w.id === "w2")!.mode, "minimized");
    assertEquals(state.activeId, "w1");
    const minimizedNormal = state.windows.find((w) => w.id === "w2")!;
    assertEquals(minimizedNormal.frame, normalBeforeMinimize.frame);
    assertEquals(minimizedNormal.frameBasis, normalBeforeMinimize.frameBasis);
    assertEquals(minimizedNormal.restoreFrame, null);
    assertEquals(minimizedNormal.restoreFrameBasis, null);

    // Restoring normal window w2 restores it to "normal" mode and activates it
    state = desktopReducer(state, {
        type: "RESTORE",
        id: "w2",
        rect: sampleRect,
    });
    assertEquals(state.windows.find((w) => w.id === "w2")!.mode, "normal");
    assertEquals(
        state.windows.find((w) => w.id === "w2")!.frame,
        normalBeforeMinimize.frame,
    );
    assertEquals(
        state.windows.find((w) => w.id === "w2")!.frameBasis,
        normalBeforeMinimize.frameBasis,
    );
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
    const preMinRestoreFrameBasis =
        state.windows.find((w) => w.id === "w2")!.restoreFrameBasis;
    assertNotEquals(preMinRestoreFrameBasis, null);

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
    assertEquals(restoredFromMax.restoreFrameBasis, preMinRestoreFrameBasis);
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
    assertEquals(
        state.windows[0].frameBasis,
        frameBasisForGeometry(sampleRect),
    );

    // Move with out-of-bounds coordinates clamps to the viewport while keeping the titlebar above Dock.
    state = desktopReducer(state, {
        type: "MOVE",
        id: "w1",
        frame: { x: 2000, y: 2000, width: 760, height: 700 },
        rect: sampleRect,
    });
    assertEquals(
        state.windows[0].frame.x,
        sampleRect.viewportRect.width - 760,
    );
    assertEquals(
        state.windows[0].frame.y,
        Math.min(
            sampleRect.viewportRect.height - 700,
            sampleRect.dockTop - sampleRect.chromeHeight,
        ),
    );

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
    assertEquals(
        state.windows[0].frameBasis,
        frameBasisForGeometry(sampleRect),
    );
    assertEquals(state.windows[0].restoreFrameBasis, null);
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
    assertEquals(
        state.windows[0].frameBasis,
        frameBasisForGeometry(sampleRect),
    );
    assertEquals(state.windows[0].restoreFrameBasis, null);
});

Deno.test("desktop-state: semantic geometry commits record the current viewport basis", () => {
    const smallRect = desktopGeometry(1024, 768, 56, 688, 16, 48);
    const mediumRect = desktopGeometry(1280, 800, 64, 740, 16, 48);
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "apps",
        kind: "apps",
        rect: sampleRect,
    });
    assertEquals(
        state.windows[0].frameBasis,
        frameBasisForGeometry(sampleRect),
    );

    state = desktopReducer(state, {
        type: "MOVE",
        id: "apps",
        frame: { x: 80, y: 100, width: 500, height: 400 },
        rect: smallRect,
    });
    assertEquals(state.windows[0].frameBasis, frameBasisForGeometry(smallRect));

    state = desktopReducer(state, {
        type: "RESIZE",
        id: "apps",
        frame: { x: 100, y: 120, width: 600, height: 500 },
        rect: mediumRect,
    });
    assertEquals(
        state.windows[0].frameBasis,
        frameBasisForGeometry(mediumRect),
    );

    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "apps",
        rect: mediumRect,
    });
    assertEquals(
        state.windows[0].restoreFrameBasis,
        frameBasisForGeometry(mediumRect),
    );
    state = desktopReducer(state, {
        type: "RESTORE",
        id: "apps",
        rect: smallRect,
    });
    assertEquals(state.windows[0].frameBasis, frameBasisForGeometry(smallRect));
    assertEquals(state.windows[0].restoreFrameBasis, null);

    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "apps",
        rect: smallRect,
    });
    state = desktopReducer(state, {
        type: "RESTORE_FRAME",
        id: "apps",
        rect: mediumRect,
    });
    assertEquals(
        state.windows[0].frameBasis,
        frameBasisForGeometry(mediumRect),
    );
    assertEquals(state.windows[0].restoreFrameBasis, null);
});

Deno.test("desktop-state: changing snap modes preserves the canonical restore pair", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "apps",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "MOVE",
        id: "apps",
        frame: { x: 540, y: 160, width: 760, height: 566 },
        rect: sampleRect,
    });
    const normalFrame = state.windows[0].frame;
    const normalBasis = state.windows[0].frameBasis;

    state = desktopReducer(state, {
        type: "SNAP",
        id: "apps",
        snap: "left",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "apps",
        rect: sampleRect,
    });
    assertEquals(state.windows[0].restoreFrame, normalFrame);
    assertEquals(state.windows[0].restoreFrameBasis, normalBasis);

    state = desktopReducer(state, { type: "MINIMIZE", id: "apps" });
    state = desktopReducer(state, {
        type: "SNAP",
        id: "apps",
        snap: "bottom-right",
        rect: sampleRect,
    });
    assertEquals(state.windows[0].mode, "snapped");
    assertEquals(state.windows[0].restoreFrame, normalFrame);
    assertEquals(state.windows[0].restoreFrameBasis, normalBasis);
});

Deno.test("desktop-state: presentation shrink and grow preserve normal and restore geometry", () => {
    const wideRect = sampleRect;
    const narrowRect = desktopGeometry(1024, 768, 64, 720, 16, 48);
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w-normal",
        kind: "apps",
        rect: wideRect,
    });
    state = desktopReducer(state, {
        type: "MOVE",
        id: "w-normal",
        frame: { x: 540, y: 160, width: 760, height: 566 },
        rect: wideRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "w-max",
        kind: "notes",
        rect: wideRect,
    });
    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "w-max",
        rect: wideRect,
    });
    const canonicalState = structuredClone(state);
    const normal = state.windows.find((w) => w.id === "w-normal")!;
    const maximized = state.windows.find((w) => w.id === "w-max")!;

    assertEquals(
        resolveWindowPresentationFrame(normal, narrowRect),
        { x: 264, y: 160, width: 760, height: 566 },
    );
    assertEquals(
        resolveWindowPresentationFrame(maximized, narrowRect),
        snapFrame("maximize", narrowRect.workRect),
    );
    assertEquals(state, canonicalState);
    assertEquals(
        resolveWindowPresentationFrame(normal, wideRect),
        normal.frame,
    );
    assertEquals(
        resolveWindowPresentationFrame(maximized, wideRect),
        wideRect.workRect,
    );
    assertEquals(state, canonicalState);
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
                makeWindow("w1", "apps", {
                    x: 0,
                    y: 0,
                    width: 600,
                    height: 400,
                }, 10),
                makeWindow(
                    "w2",
                    "notes",
                    {
                        x: 50,
                        y: 50,
                        width: 600,
                        height: 400,
                    },
                    20,
                    { mode: "minimized" },
                ),
            ],
            activeId: "w2",
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
    assertEquals(leftWin.frame, snapFrame("left", sampleRect.workRect));
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
    assertEquals(trWin.frame, snapFrame("top-right", sampleRect.workRect));
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
    assertEquals(maxWin.frame, snapFrame("maximize", sampleRect.workRect));
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
    assertEquals(maxWin.frame, snapFrame("maximize", sampleRect.workRect));
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
    assertEquals(
        restoredSnap.frame,
        snapFrame("bottom-right", sampleRect.workRect),
    );
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

Deno.test("desktop-state: snapped and maximized presentations follow Work Rect without state writes", () => {
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
    const initialBasis = state.windows[0].frameBasis;

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
    const semanticState = structuredClone(state);

    const newRect = desktopGeometry(1200, 800, 64, 740, 16, 48);
    const winSnapped = state.windows.find((w) => w.id === "w-snapped")!;
    const winMax = state.windows.find((w) => w.id === "w-max")!;
    assertEquals(
        resolveWindowPresentationFrame(winSnapped, newRect),
        snapFrame("right", newRect.workRect),
    );
    assertEquals(winSnapped.mode, "snapped");
    assertEquals(winSnapped.snap, "right");
    assertEquals(winSnapped.restoreFrame, snappedNormalFrame);
    assertEquals(winSnapped.restoreFrameBasis, initialBasis);

    assertEquals(
        resolveWindowPresentationFrame(winMax, newRect),
        snapFrame("maximize", newRect.workRect),
    );
    assertEquals(winMax.mode, "maximized");
    assertEquals(winMax.snap, "maximize");
    assertEquals(winMax.restoreFrameBasis, initialBasis);
    assertEquals(state, semanticState);
});

Deno.test("desktop-state: Snap and Minimize preserve canonical restore geometry across viewport changes", () => {
    const r1440 = desktopGeometry(1440, 900, 64, 820, 16, 48);
    const r1024 = desktopGeometry(1024, 768, 56, 688, 16, 48);

    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "w1",
        kind: "apps",
        rect: r1440,
    });
    const initialFrame = state.windows[0].frame;
    const initialBasis = state.windows[0].frameBasis;

    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "left",
        rect: r1440,
    });
    assertEquals(state.windows[0].mode, "snapped");
    assertEquals(state.windows[0].snap, "left");
    assertEquals(state.windows[0].restoreFrame, initialFrame);
    assertEquals(state.windows[0].restoreFrameBasis, initialBasis);

    state = desktopReducer(state, {
        type: "SNAP",
        id: "w1",
        snap: "bottom-right",
        rect: r1440,
    });
    assertEquals(state.windows[0].mode, "snapped");
    assertEquals(state.windows[0].snap, "bottom-right");
    assertEquals(state.windows[0].restoreFrame, initialFrame);
    assertEquals(state.windows[0].restoreFrameBasis, initialBasis);

    state = desktopReducer(state, { type: "MINIMIZE", id: "w1" });
    const minimizedSemantic = structuredClone(state.windows[0]);
    assertEquals(state.windows[0].mode, "minimized");
    assertEquals(
        resolveWindowPresentationFrame(state.windows[0], r1024),
        snapFrame("bottom-right", r1024.workRect),
    );
    assertEquals(state.windows[0], minimizedSemantic);

    state = desktopReducer(state, { type: "RESTORE", id: "w1", rect: r1024 });
    assertEquals(state.windows[0].mode, "snapped");
    assertEquals(state.windows[0].snap, "bottom-right");
    assertEquals(state.windows[0].frame, minimizedSemantic.frame);
    assertEquals(state.windows[0].frameBasis, minimizedSemantic.frameBasis);
    assertEquals(state.windows[0].restoreFrame, initialFrame);
    assertEquals(state.windows[0].restoreFrameBasis, initialBasis);
    assertEquals(
        resolveWindowPresentationFrame(state.windows[0], r1024),
        snapFrame("bottom-right", r1024.workRect),
    );

    state = desktopReducer(state, { type: "RESTORE", id: "w1", rect: r1024 });
    assertEquals(state.windows[0].mode, "normal");
    assertEquals(state.windows[0].snap, null);
    assertEquals(state.windows[0].frame, {
        x: 264,
        y: 160,
        width: 760,
        height: 565,
    });
    assertEquals(state.windows[0].frameBasis, frameBasisForGeometry(r1024));
    assertEquals(state.windows[0].restoreFrame, null);
    assertEquals(state.windows[0].restoreFrameBasis, null);

    state = desktopReducer(state, { type: "MAXIMIZE", id: "w1", rect: r1024 });
    assertEquals(state.windows[0].mode, "maximized");
    assertEquals(state.windows[0].snap, "maximize");
    assertEquals(state.windows[0].restoreFrame, {
        x: 264,
        y: 160,
        width: 760,
        height: 565,
    });
    assertEquals(
        state.windows[0].restoreFrameBasis,
        frameBasisForGeometry(r1024),
    );

    state = desktopReducer(state, {
        type: "RESTORE_FRAME",
        id: "w1",
        rect: r1024,
    });
    assertEquals(state.windows[0].mode, "normal");
    assertEquals(state.windows[0].snap, null);
    assertEquals(state.windows[0].frameBasis, frameBasisForGeometry(r1024));
    assertEquals(state.windows[0].restoreFrame, null);
    assertEquals(state.windows[0].restoreFrameBasis, null);
});

Deno.test("desktop-state: OPEN restores minimized windows without replacing their canonical geometry", () => {
    let state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "normal",
        kind: "apps",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "MOVE",
        id: "normal",
        frame: { x: 540, y: 160, width: 760, height: 566 },
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "snapped",
        kind: "notes",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "SNAP",
        id: "snapped",
        snap: "right",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "OPEN",
        id: "maximized",
        kind: "notes",
        rect: sampleRect,
    });
    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "maximized",
        rect: sampleRect,
    });
    state = desktopReducer(state, { type: "MINIMIZE", id: "normal" });
    state = desktopReducer(state, { type: "MINIMIZE", id: "snapped" });
    state = desktopReducer(state, { type: "MINIMIZE", id: "maximized" });

    const canonicalNormal = structuredClone(
        state.windows.find((w) => w.id === "normal")!,
    );
    const canonicalSnapped = structuredClone(
        state.windows.find((w) => w.id === "snapped")!,
    );
    const canonicalMaximized = structuredClone(
        state.windows.find((w) => w.id === "maximized")!,
    );
    const narrowRect = desktopGeometry(1024, 768, 64, 720, 16, 48);

    state = desktopReducer(state, {
        type: "OPEN",
        id: "normal",
        kind: "apps",
        rect: narrowRect,
    });
    const restoredNormal = state.windows.find((w) => w.id === "normal")!;
    assertEquals(restoredNormal.mode, "normal");
    assertEquals(restoredNormal.frame, canonicalNormal.frame);
    assertEquals(restoredNormal.frameBasis, canonicalNormal.frameBasis);
    assertEquals(restoredNormal.restoreFrame, null);
    assertEquals(restoredNormal.restoreFrameBasis, null);

    state = desktopReducer(state, {
        type: "OPEN",
        id: "snapped",
        kind: "notes",
        rect: narrowRect,
    });
    const restoredSnapped = state.windows.find((w) => w.id === "snapped")!;
    assertEquals(restoredSnapped.mode, "snapped");
    assertEquals(restoredSnapped.snap, "right");
    assertEquals(restoredSnapped.frame, canonicalSnapped.frame);
    assertEquals(restoredSnapped.frameBasis, canonicalSnapped.frameBasis);
    assertEquals(restoredSnapped.restoreFrame, canonicalSnapped.restoreFrame);
    assertEquals(
        restoredSnapped.restoreFrameBasis,
        canonicalSnapped.restoreFrameBasis,
    );
    assertEquals(
        resolveWindowPresentationFrame(restoredSnapped, narrowRect),
        snapFrame("right", narrowRect.workRect),
    );
    state = desktopReducer(state, {
        type: "OPEN",
        id: "maximized",
        kind: "notes",
        rect: narrowRect,
    });
    const restoredMaximized = state.windows.find((w) => w.id === "maximized")!;
    assertEquals(restoredMaximized.mode, "maximized");
    assertEquals(restoredMaximized.snap, "maximize");
    assertEquals(restoredMaximized.frame, canonicalMaximized.frame);
    assertEquals(restoredMaximized.frameBasis, canonicalMaximized.frameBasis);
    assertEquals(
        restoredMaximized.restoreFrame,
        canonicalMaximized.restoreFrame,
    );
    assertEquals(
        restoredMaximized.restoreFrameBasis,
        canonicalMaximized.restoreFrameBasis,
    );
    assertEquals(
        resolveWindowPresentationFrame(restoredMaximized, narrowRect),
        snapFrame("maximize", narrowRect.workRect),
    );
});

Deno.test("desktop-state: unusable viewport presentation does not write semantic geometry", () => {
    const state = desktopReducer(initialDesktopState, {
        type: "OPEN",
        id: "apps",
        kind: "apps",
        rect: sampleRect,
    });
    const canonicalState = structuredClone(state);
    const unusable = desktopGeometry(1024, 200, 64, 100, 16, 48);

    assertEquals(unusable.usable, false);
    assertEquals(
        resolveWindowPresentationFrame(state.windows[0], unusable),
        { x: 264, y: 64, width: 760, height: 136 },
    );
    assertEquals(state, canonicalState);
    assertEquals(
        desktopReducer(initialDesktopState, {
            type: "OPEN",
            id: "apps",
            kind: "apps",
            rect: unusable,
        }),
        initialDesktopState,
    );
    assertEquals(
        desktopReducer(state, {
            type: "MOVE",
            id: "apps",
            frame: { x: 10, y: 10, width: 480, height: 360 },
            rect: unusable,
        }),
        state,
    );
});
Deno.test("desktop-state: unusable safe inset rejects a new window", () => {
    const zeroSafe = desktopGeometry(1440, 900, 64, 820, 800, 48);

    assertEquals(zeroSafe.usable, true);
    assertEquals(zeroSafe.safeRect.width, 0);
    assertEquals(zeroSafe.safeRect.height, 0);
    assertEquals(
        desktopReducer(initialDesktopState, {
            type: "OPEN",
            id: "apps",
            kind: "apps",
            rect: zeroSafe,
        }),
        initialDesktopState,
    );
});
