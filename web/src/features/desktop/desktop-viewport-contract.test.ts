import { assertEquals } from "@std/assert";
import {
    desktopGeometry,
    type Frame,
    frameBasisForGeometry,
    resolveWindowPresentationFrame,
    snapFrame,
} from "./desktop-geometry.ts";
import {
    decodeDesktopLayout,
    encodeDesktopLayout,
} from "./desktop-persistence.ts";
import {
    desktopReducer,
    type DesktopWindowState,
    initialDesktopState,
} from "./desktop-state.ts";

const geometry = desktopGeometry(1440, 900, 64, 820, 16, 48);

Deno.test("#147 Snap fills Work Rect in viewport coordinates without gap", () => {
    assertEquals(snapFrame("maximize", geometry.workRect), {
        x: 0,
        y: 64,
        width: 1440,
        height: 756,
    });
    assertEquals(snapFrame("bottom-right", geometry.workRect), {
        x: 720,
        y: 442,
        width: 720,
        height: 378,
    });
});

Deno.test("#147 normal presentation keeps the titlebar visible while Dock covers the body", () => {
    const resolveNormalPresentation = (frame: Frame) =>
        resolveWindowPresentationFrame({
            id: "document:d1",
            kind: "document",
            entityId: "d1",
            frame,
            frameBasis: frameBasisForGeometry(geometry),
            restoreFrame: null,
            restoreFrameBasis: null,
            mode: "normal",
            zOrder: 1,
            snap: null,
        }, geometry);
    const frame = resolveNormalPresentation({
        x: -50,
        y: 1000,
        width: 600,
        height: 360,
    });
    assertEquals(frame, { x: 0, y: 540, width: 600, height: 360 });
    assertEquals(frame.y + geometry.chromeHeight <= geometry.dockTop, true);
    assertEquals(frame.y + frame.height > geometry.dockTop, true);
    assertEquals(
        resolveNormalPresentation({
            x: 0,
            y: -50,
            width: 600,
            height: 360,
        }).y,
        geometry.chromeBottom,
    );
});

Deno.test("#163 chrome and Dock measurements only change normal presentation", () => {
    const frame = { x: 900, y: 500, width: 500, height: 300 };
    const window: DesktopWindowState = {
        id: "note",
        kind: "note",
        entityId: "n1",
        frame,
        frameBasis: frameBasisForGeometry(geometry),
        restoreFrame: null,
        restoreFrameBasis: null,
        mode: "normal" as const,
        zOrder: 1,
        snap: null,
    };
    const canonicalWindow = structuredClone(window);
    const changedChromeAndDock = desktopGeometry(1440, 900, 96, 500, 16, 48);

    assertEquals(resolveWindowPresentationFrame(window, geometry), frame);
    assertEquals(
        resolveWindowPresentationFrame(window, changedChromeAndDock),
        { x: 900, y: 452, width: 500, height: 300 },
    );
    assertEquals(window, canonicalWindow);
});

Deno.test("#147 legacy v3 safe-local document restores to viewport coordinates and encodes as v4", () => {
    const payload = {
        version: 3,
        activeId: "document:d1",
        windows: [{
            id: "document:d1",
            kind: "document",
            entityId: "d1",
            mode: "normal",
            snap: null,
            zOrder: 1,
            frame: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
            restoreFrame: null,
        }],
    };
    const restored = decodeDesktopLayout(payload, geometry)!;
    assertEquals(restored.windows[0].frame, {
        x: 157,
        y: 225,
        width: 704,
        height: 362,
    });
    assertEquals(
        restored.windows[0].frameBasis,
        frameBasisForGeometry(geometry),
    );
    assertEquals(restored.windows[0].restoreFrameBasis, null);

    const encoded = encodeDesktopLayout(restored);
    assertEquals(encoded.version, 4);
    assertEquals(encoded.windows[0].frame.y, 225 / 900);
});

Deno.test("#147 maximize and restore retain the normal viewport frame", () => {
    const normal = { x: 16, y: 80, width: 700, height: 500 };
    let state = desktopReducer(initialDesktopState, {
        type: "HYDRATE",
        state: {
            windows: [{
                id: "document:d1",
                kind: "document",
                entityId: "d1",
                frame: normal,
                frameBasis: frameBasisForGeometry(geometry),
                restoreFrame: null,
                restoreFrameBasis: null,
                mode: "normal",
                snap: null,
                zOrder: 1,
            }],
            activeId: "document:d1",
        },
    });

    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "document:d1",
        rect: geometry,
    });
    assertEquals(state.windows[0].frame, geometry.workRect);
    assertEquals(
        resolveWindowPresentationFrame(state.windows[0], geometry),
        geometry.workRect,
    );
    assertEquals(state.windows[0].restoreFrame, normal);
    assertEquals(
        state.windows[0].restoreFrameBasis,
        frameBasisForGeometry(geometry),
    );

    state = desktopReducer(state, {
        type: "RESTORE",
        id: "document:d1",
        rect: geometry,
    });
    assertEquals(state.windows[0].frame, normal);
    assertEquals(state.windows[0].frameBasis, frameBasisForGeometry(geometry));
    assertEquals(state.windows[0].restoreFrame, null);
    assertEquals(state.windows[0].restoreFrameBasis, null);
});
