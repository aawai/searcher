import { assertEquals, assertThrows } from "@std/assert";
import {
    clampFrame,
    defaultFrame,
    desktopGeometry,
    type Frame,
    type FrameBasis,
    frameBasisForGeometry,
    minimumSize,
    resizeFrame,
    resolveWindowPresentationFrame,
    snapFrame,
    type SnapMode,
    snapTarget,
} from "./desktop-geometry.ts";
import type { DesktopWindowState, WindowMode } from "./desktop-state.ts";

function makeWindowState(
    frame: Frame,
    frameBasis: FrameBasis,
    mode: WindowMode,
    snap: SnapMode | null,
    restore: { frame: Frame; basis: FrameBasis } | null,
): DesktopWindowState {
    return {
        id: "window",
        kind: "apps",
        entityId: null,
        frame,
        frameBasis,
        restoreFrame: restore?.frame ?? null,
        restoreFrameBasis: restore?.basis ?? null,
        mode,
        zOrder: 1,
        snap,
    };
}

Deno.test("desktop-geometry: normal presentation clamps canonical geometry on shrink and restores it on grow", () => {
    const wideGeometry = desktopGeometry(1440, 900, 64, 820, 16, 48);
    const narrowGeometry = desktopGeometry(1024, 768, 64, 720, 16, 48);
    const window: DesktopWindowState = {
        id: "apps",
        kind: "apps",
        entityId: null,
        frame: { x: 820, y: 140, width: 560, height: 500 },
        frameBasis: frameBasisForGeometry(wideGeometry),
        restoreFrame: null,
        restoreFrameBasis: null,
        mode: "normal",
        zOrder: 1,
        snap: null,
    };
    const canonicalWindow = structuredClone(window);

    assertEquals(
        resolveWindowPresentationFrame(window, narrowGeometry),
        { x: 464, y: 140, width: 560, height: 500 },
    );
    assertEquals(window, canonicalWindow);
    assertEquals(window.frameBasis, { width: 1440, height: 900 });
    assertEquals(
        resolveWindowPresentationFrame(window, wideGeometry),
        window.frame,
    );
});

Deno.test("desktop-geometry: all snap modes follow current Work Rect without changing canonical restore geometry", () => {
    const wideGeometry = desktopGeometry(1440, 900, 64, 820, 16, 48);
    const narrowGeometry = desktopGeometry(1200, 800, 72, 760, 20, 48);
    const frameBasis = frameBasisForGeometry(wideGeometry);
    const restore = {
        frame: { x: 520, y: 150, width: 700, height: 500 },
        basis: frameBasis,
    };
    const snapModes: SnapMode[] = [
        "left",
        "right",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
        "maximize",
    ];

    for (const snap of snapModes) {
        const snapMode: WindowMode = snap === "maximize"
            ? "maximized"
            : "snapped";
        const window = makeWindowState(
            snapFrame(snap, wideGeometry.workRect),
            frameBasis,
            snapMode,
            snap,
            restore,
        );
        const canonicalWindow = structuredClone(window);
        assertEquals(
            resolveWindowPresentationFrame(window, narrowGeometry),
            snapFrame(snap, narrowGeometry.workRect),
        );
        assertEquals(window, canonicalWindow);

        const minimized = makeWindowState(
            window.frame,
            window.frameBasis,
            "minimized",
            snap,
            restore,
        );
        const minimizedSemantic = structuredClone(minimized);
        assertEquals(
            resolveWindowPresentationFrame(minimized, narrowGeometry),
            snapFrame(snap, narrowGeometry.workRect),
        );
        assertEquals(minimized, minimizedSemantic);
    }
});

Deno.test("desktop-geometry: unusable viewport falls back to canonical normal geometry without changing mode", () => {
    const wideGeometry = desktopGeometry(1440, 900, 64, 820, 16, 48);
    const unusableGeometry = desktopGeometry(1024, 200, 64, 100, 16, 48);
    const frameBasis = frameBasisForGeometry(wideGeometry);
    const restore = {
        frame: { x: 820, y: 140, width: 560, height: 500 },
        basis: frameBasis,
    };
    const normalWindow = makeWindowState(
        restore.frame,
        frameBasis,
        "normal",
        null,
        null,
    );
    const snappedWindow = makeWindowState(
        snapFrame("right", wideGeometry.workRect),
        frameBasis,
        "snapped",
        "right",
        restore,
    );
    const maximizedWindow = makeWindowState(
        snapFrame("maximize", wideGeometry.workRect),
        frameBasis,
        "maximized",
        "maximize",
        restore,
    );

    for (const window of [normalWindow, snappedWindow, maximizedWindow]) {
        const semanticWindow = structuredClone(window);
        assertEquals(
            resolveWindowPresentationFrame(window, unusableGeometry),
            clampFrame(
                window.restoreFrame ?? window.frame,
                unusableGeometry,
                window.kind,
            ),
        );
        assertEquals(window, semanticWindow);
    }
});

Deno.test("desktop-geometry: constructs viewport, Work Rect, and Safe Rect from measured bounds", () => {
    const geometry = desktopGeometry(1440, 900, 64, 820, 16, 48);
    assertEquals(frameBasisForGeometry(geometry), { width: 1440, height: 900 });
    assertThrows(
        () => frameBasisForGeometry(desktopGeometry(0, 0)),
        RangeError,
    );

    assertEquals(geometry.viewportRect, {
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
    });
    assertEquals(geometry.workRect, {
        x: 0,
        y: 64,
        width: 1440,
        height: 756,
    });
    assertEquals(geometry.safeRect, {
        x: 16,
        y: 80,
        width: 1408,
        height: 724,
    });
    assertEquals(geometry.chromeBottom, 64);
    assertEquals(geometry.dockTop, 820);
    assertEquals(geometry.windowGap, 16);
    assertEquals(geometry.chromeHeight, 48);
    assertEquals(geometry.usable, true);

    assertEquals(desktopGeometry(1024, 768, 64, 720, 16, 48).usable, true);
    assertEquals(desktopGeometry(1024, 768, 64, 300, 16, 48).usable, false);
});

Deno.test("desktop-geometry: minimumSize preserves kind minima and bounds them to available space", () => {
    const appsMin = minimumSize("apps");
    assertEquals(appsMin, {
        width: 480,
        height: 360,
        minWidth: 480,
        minHeight: 360,
    });
    assertEquals(minimumSize("notes").width, 400);
    assertEquals(minimumSize("notes").height, 320);
    assertEquals(minimumSize("note").width, 320);
    assertEquals(minimumSize("note").height, 240);

    const available = desktopGeometry(300, 200, 0, 200, 0, 48, 0).safeRect;
    assertEquals(minimumSize("apps", available).width, 300);
    assertEquals(minimumSize("apps", available).height, 200);
});

Deno.test("desktop-geometry: normal frames use viewport bounds and keep the titlebar above Dock", () => {
    const geometry = desktopGeometry(1440, 900, 50, 600, 20, 48);

    const clampedTopLeft = clampFrame(
        { x: -50, y: -20, width: 500, height: 400 },
        geometry,
        "apps",
    );
    assertEquals(clampedTopLeft, { x: 0, y: 50, width: 500, height: 400 });

    const clampedBottomRight = clampFrame(
        { x: 1300, y: 800, width: 500, height: 400 },
        geometry,
        "apps",
    );
    assertEquals(clampedBottomRight, {
        x: 940,
        y: 500,
        width: 500,
        height: 400,
    });

    const clampedTiny = clampFrame(
        { x: 10, y: 10, width: 100, height: 100 },
        geometry,
        "note",
    );
    assertEquals(clampedTiny, {
        x: 10,
        y: 50,
        width: 320,
        height: 240,
    });

    const frameAtDock = clampFrame(
        { x: 120, y: 760, width: 500, height: 300 },
        geometry,
        "note",
    );
    assertEquals(frameAtDock.y + geometry.chromeHeight, geometry.dockTop);
    assertEquals(frameAtDock.y + frameAtDock.height > geometry.dockTop, true);
});
Deno.test("desktop-geometry: unusable viewport still has a titlebar-reachable presentation frame", () => {
    const geometry = desktopGeometry(1024, 200, 64, 122, 16, 48);
    const frame = clampFrame(
        { x: 0, y: 162, width: 768, height: 610 },
        geometry,
        "document",
    );

    assertEquals(geometry.usable, false);
    assertEquals(frame, { x: 0, y: 64, width: 768, height: 136 });
    assertEquals(frame.y >= geometry.chromeBottom, true);
    assertEquals(frame.y + geometry.chromeHeight <= geometry.dockTop, true);
    assertEquals(
        frame.x + frame.width <= geometry.viewportRect.width,
        true,
    );
    assertEquals(
        frame.y + frame.height <= geometry.viewportRect.height,
        true,
    );
});

Deno.test("desktop-geometry: defaultFrame opens within safeRect in viewport coordinates", () => {
    const geometry = desktopGeometry(1440, 900, 64, 820, 16, 48);

    const appsFrame = defaultFrame("apps", geometry);
    assertEquals(appsFrame, { x: 340, y: 160, width: 760, height: 565 });

    const notesFrame = defaultFrame("notes", geometry);
    assertEquals(notesFrame, { x: 400, y: 174, width: 640, height: 536 });

    const noteFrame = defaultFrame("note", geometry);
    assertEquals(noteFrame, { x: 440, y: 196, width: 560, height: 492 });
    assertEquals(noteFrame.x >= geometry.safeRect.x, true);
    assertEquals(noteFrame.y >= geometry.safeRect.y, true);

    const smallGeometry = desktopGeometry(800, 600, 0, 600, 0, 48, 0);
    const smallApps = defaultFrame("apps", smallGeometry);
    assertEquals(smallApps, { x: 112, y: 66, width: 576, height: 468 });
});

Deno.test("desktop-geometry: defaultFrame cascades by 24px and wraps within safeRect", () => {
    const geometry = desktopGeometry(1000, 800, 0, 800, 0, 48, 0);
    const f0 = defaultFrame("note", geometry, 0);
    const f1 = defaultFrame("note", geometry, 1);
    const f2 = defaultFrame("note", geometry, 2);

    assertEquals(f1.x, f0.x + 24);
    assertEquals(f1.y, f0.y + 24);
    assertEquals(f2.x, f0.x + 48);
    assertEquals(f2.y, f0.y + 48);

    const f5 = defaultFrame("note", geometry, 5);
    assertEquals(f5.x, f0.x + 5 * 24);
    assertEquals(f5.y, f0.y + 5 * 24);

    const f6 = defaultFrame("note", geometry, 6);
    assertEquals(f6.x, f0.x);
    assertEquals(f6.y, f0.y);
});

Deno.test("desktop-geometry: resizeFrame keeps opposite edges anchored in all eight directions", () => {
    const geometry = desktopGeometry(1200, 800, 40, 760, 16, 48, 0);
    const initial: Frame = { x: 200, y: 200, width: 400, height: 300 };

    assertEquals(resizeFrame(initial, "e", 50, 0, geometry, "note"), {
        x: 200,
        y: 200,
        width: 450,
        height: 300,
    });
    assertEquals(resizeFrame(initial, "w", -50, 0, geometry, "note"), {
        x: 150,
        y: 200,
        width: 450,
        height: 300,
    });
    assertEquals(resizeFrame(initial, "s", 0, 40, geometry, "note"), {
        x: 200,
        y: 200,
        width: 400,
        height: 340,
    });
    assertEquals(resizeFrame(initial, "n", 0, -40, geometry, "note"), {
        x: 200,
        y: 160,
        width: 400,
        height: 340,
    });
    assertEquals(resizeFrame(initial, "se", 30, 30, geometry, "note"), {
        x: 200,
        y: 200,
        width: 430,
        height: 330,
    });
    assertEquals(resizeFrame(initial, "nw", -20, -20, geometry, "note"), {
        x: 180,
        y: 180,
        width: 420,
        height: 320,
    });
    assertEquals(resizeFrame(initial, "sw", -20, 20, geometry, "note"), {
        x: 180,
        y: 200,
        width: 420,
        height: 320,
    });
    assertEquals(resizeFrame(initial, "ne", 20, -20, geometry, "note"), {
        x: 200,
        y: 180,
        width: 420,
        height: 320,
    });

    assertEquals(resizeFrame(initial, "w", 200, 0, geometry, "note"), {
        x: 280,
        y: 200,
        width: 320,
        height: 300,
    });
    assertEquals(resizeFrame(initial, "n", 0, 200, geometry, "note"), {
        x: 200,
        y: 260,
        width: 400,
        height: 240,
    });

    const expandPastLeft = resizeFrame(initial, "w", -500, 0, geometry, "note");
    assertEquals(expandPastLeft.x, 0);
    assertEquals(expandPastLeft.width, 600);
    const expandPastRight = resizeFrame(
        initial,
        "e",
        2000,
        0,
        geometry,
        "note",
    );
    assertEquals(expandPastRight.x, 200);
    assertEquals(expandPastRight.width, 1000);
});

Deno.test("desktop-geometry: empty viewport geometry produces finite empty frames", () => {
    const geometry = desktopGeometry(0, 0);
    const frame = defaultFrame("apps", geometry);
    assertEquals(frame, { x: 0, y: 0, width: 0, height: 0 });

    assertEquals(
        clampFrame(
            { x: 50, y: 50, width: 200, height: 200 },
            geometry,
            "apps",
        ),
        { x: 0, y: 0, width: 0, height: 0 },
    );
});

Deno.test("desktop-geometry: snapFrame covers all seven modes in the Work Rect", () => {
    const workRect = desktopGeometry(1440, 900, 64, 864, 0, 48, 0).workRect;
    assertEquals(workRect, { x: 0, y: 64, width: 1440, height: 800 });

    assertEquals(snapFrame("maximize", workRect), {
        x: 0,
        y: 64,
        width: 1440,
        height: 800,
    });
    assertEquals(snapFrame("left", workRect), {
        x: 0,
        y: 64,
        width: 720,
        height: 800,
    });
    assertEquals(snapFrame("right", workRect), {
        x: 720,
        y: 64,
        width: 720,
        height: 800,
    });
    assertEquals(snapFrame("top-left", workRect), {
        x: 0,
        y: 64,
        width: 720,
        height: 400,
    });
    assertEquals(snapFrame("top-right", workRect), {
        x: 720,
        y: 64,
        width: 720,
        height: 400,
    });
    assertEquals(snapFrame("bottom-left", workRect), {
        x: 0,
        y: 464,
        width: 720,
        height: 400,
    });
    assertEquals(snapFrame("bottom-right", workRect), {
        x: 720,
        y: 464,
        width: 720,
        height: 400,
    });

    const oddWorkRect = desktopGeometry(1001, 801, 64, 801, 0, 48, 0)
        .workRect;
    assertEquals(snapFrame("left", oddWorkRect), {
        x: 0,
        y: 64,
        width: 500,
        height: 737,
    });
    assertEquals(snapFrame("right", oddWorkRect), {
        x: 500,
        y: 64,
        width: 501,
        height: 737,
    });
    assertEquals(snapFrame("top-left", oddWorkRect), {
        x: 0,
        y: 64,
        width: 500,
        height: 368,
    });
    assertEquals(snapFrame("bottom-right", oddWorkRect), {
        x: 500,
        y: 432,
        width: 501,
        height: 369,
    });
});

Deno.test("desktop-geometry: snapTarget maps pointer edges to the matching Work Rect snap", () => {
    const workRect = desktopGeometry(1000, 900, 50, 850, 0, 48, 0).workRect;

    assertEquals(snapTarget(5, 55, workRect), "top-left");
    assertEquals(snapTarget(995, 55, workRect), "top-right");
    assertEquals(snapTarget(5, 845, workRect), "bottom-left");
    assertEquals(snapTarget(995, 845, workRect), "bottom-right");
    assertEquals(snapTarget(500, 55, workRect), "maximize");
    assertEquals(snapTarget(5, 450, workRect), "left");
    assertEquals(snapTarget(995, 450, workRect), "right");
    assertEquals(snapTarget(500, 845, workRect), null);
    assertEquals(snapTarget(500, 450, workRect), null);

    assertEquals(snapTarget(500, 30, workRect), "maximize");
    assertEquals(snapTarget(-20, 30, workRect), "top-left");
    assertEquals(snapTarget(500, 1000, workRect), null);
    assertEquals(snapTarget(-500, 400, workRect), null);

    const emptyWorkRect = desktopGeometry(0, 0).workRect;
    assertEquals(snapTarget(0, 0, emptyWorkRect), null);
});
