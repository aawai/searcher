import { assertEquals } from "@std/assert";
import { clampFrame, desktopGeometry, snapFrame } from "./desktop-geometry.ts";
import {
    decodeDesktopLayout,
    encodeDesktopLayout,
} from "./desktop-persistence.ts";
import { desktopReducer, initialDesktopState } from "./desktop-state.ts";

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

Deno.test("#147 normal bounds keep the titlebar visible while Dock covers the body", () => {
    const frame = clampFrame(
        { x: -50, y: 1000, width: 600, height: 360 },
        geometry,
        "document",
    );
    assertEquals(frame, { x: 0, y: 540, width: 600, height: 360 });
    assertEquals(frame.y + geometry.chromeHeight <= geometry.dockTop, true);
    assertEquals(frame.y + frame.height > geometry.dockTop, true);
    assertEquals(
        clampFrame(
            { x: 0, y: -50, width: 600, height: 360 },
            geometry,
            "document",
        ).y,
        geometry.chromeBottom,
    );
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

    const encoded = encodeDesktopLayout(restored, geometry);
    assertEquals(encoded.version, 4);
    assertEquals(encoded.windows[0].frame.y, 225 / 900);
});

Deno.test("#147 maximize and restore retain the normal viewport frame", () => {
    const normal = { x: 16, y: 80, width: 700, height: 500 };
    let state = desktopReducer(initialDesktopState, {
        type: "HYDRATE",
        state: {
            activeId: "document:d1",
            windows: [{
                id: "document:d1",
                kind: "document",
                entityId: "d1",
                frame: normal,
                restoreFrame: null,
                mode: "normal",
                snap: null,
                zOrder: 1,
            }],
        },
    });

    state = desktopReducer(state, {
        type: "MAXIMIZE",
        id: "document:d1",
        rect: geometry,
    });
    assertEquals(state.windows[0].frame, geometry.workRect);

    state = desktopReducer(state, {
        type: "RESTORE",
        id: "document:d1",
        rect: geometry,
    });
    assertEquals(state.windows[0].frame, normal);
});
