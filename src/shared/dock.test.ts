import { assertEquals } from "@std/assert";
import {
    DEFAULT_DOCK_LAYOUT,
    DEFAULT_DOCK_PREFERENCES,
    DOCK_SYSTEM_IDS,
    normalizeDockLayout,
    normalizeDockPreferences,
} from "./dock.ts";

Deno.test("shared/dock: normalizeDockPreferences fallback on null/empty/invalid input", () => {
    assertEquals(normalizeDockPreferences(null), DEFAULT_DOCK_PREFERENCES);
    assertEquals(normalizeDockPreferences(undefined), DEFAULT_DOCK_PREFERENCES);
    assertEquals(normalizeDockPreferences("invalid"), DEFAULT_DOCK_PREFERENCES);
    assertEquals(normalizeDockPreferences({}), DEFAULT_DOCK_PREFERENCES);
});

Deno.test("shared/dock: normalizeDockPreferences preserves complete system order, hiddenSystemIds, and deduplicates appIds", () => {
    const custom = {
        systemOrder: ["ai", "notes", "apps", "home"],
        hiddenSystemIds: ["notes", "ai", "notes", "invalid"],
        appIds: ["app1", "app2", "app1", "app3", ""],
    };
    const normalized = normalizeDockPreferences(custom);
    assertEquals(normalized.systemOrder, ["ai", "notes", "apps", "home"]);
    assertEquals(normalized.hiddenSystemIds, ["notes", "ai"]);
    assertEquals(normalized.appIds, ["app1", "app2", "app3"]);
});

Deno.test("shared/dock: normalizeDockPreferences backfills missing system ids", () => {
    const partial = {
        systemOrder: ["ai", "apps"],
        appIds: ["app1"],
    };
    const normalized = normalizeDockPreferences(partial);
    assertEquals(normalized.systemOrder.length, 4);
    for (const id of DOCK_SYSTEM_IDS) {
        assertEquals(normalized.systemOrder.includes(id), true);
    }
});

Deno.test("shared/dock: normalizeDockLayout validates edges, modes, and clamps ballY", () => {
    assertEquals(normalizeDockLayout(null), DEFAULT_DOCK_LAYOUT);

    const valid = normalizeDockLayout({
        edge: "right",
        mode: "collapsible",
        collapsed: true,
        ballSide: "right",
        ballY: 0.75,
    });
    assertEquals(valid.edge, "right");
    assertEquals(valid.mode, "collapsible");
    assertEquals(valid.collapsed, true);
    assertEquals(valid.ballSide, "right");
    assertEquals(valid.ballY, 0.75);

    // Out of bounds ballY clamped
    const clampedHigh = normalizeDockLayout({ ballY: 1.5 });
    assertEquals(clampedHigh.ballY, 1);

    const clampedLow = normalizeDockLayout({ ballY: -0.2 });
    assertEquals(clampedLow.ballY, 0);

    // Invalid edge and mode fallback to default
    const fallback = normalizeDockLayout({
        edge: "diagonal",
        mode: "floating",
    });
    assertEquals(fallback.edge, DEFAULT_DOCK_LAYOUT.edge);
    assertEquals(fallback.mode, DEFAULT_DOCK_LAYOUT.mode);
});
