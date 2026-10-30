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
    assertEquals(normalized.systemOrder, [
        "ai",
        "notes",
        "apps",
        "home",
        "settings",
        "trash",
    ]);
    assertEquals(normalized.hiddenSystemIds, ["notes", "ai"]);
    assertEquals(normalized.appIds, ["app1", "app2", "app3"]);
});

Deno.test("shared/dock: normalizeDockPreferences backfills missing system ids", () => {
    const partial = {
        systemOrder: ["ai", "apps"],
        appIds: ["app1"],
    };
    const normalized = normalizeDockPreferences(partial);
    assertEquals(normalized.systemOrder, [
        "ai",
        "apps",
        "home",
        "notes",
        "settings",
        "trash",
    ]);
    for (const id of DOCK_SYSTEM_IDS) {
        assertEquals(normalized.systemOrder.includes(id), true);
    }
});

Deno.test("shared/dock: legacy duplicates and unknown ids are discarded without reordering", () => {
    assertEquals(
        normalizeDockPreferences({
            systemOrder: ["notes", "invalid", "notes", "home", "ai", "apps"],
            hiddenSystemIds: ["home", "apps", "notes", "ai"],
            appIds: ["app2", "app1", "app2"],
            obsolete: true,
        }),
        {
            systemOrder: ["notes", "home", "ai", "apps", "settings", "trash"],
            hiddenSystemIds: ["home", "apps", "notes", "ai"],
            appIds: ["app2", "app1"],
        },
    );
});

Deno.test("shared/dock: normalizeDockLayout migrates legacy collapsible, preserves new collapsed state, and clamps ballY", () => {
    assertEquals(normalizeDockLayout(null), DEFAULT_DOCK_LAYOUT);

    const legacyCollapsible = normalizeDockLayout({
        edge: "right",
        mode: "collapsible",
        collapsed: true,
        ballSide: "right",
        ballY: 0.75,
    });
    assertEquals(legacyCollapsible, {
        edge: "right",
        collapsed: true,
        ballSide: "right",
        ballY: 0.75,
    });

    const modernCollapsed = normalizeDockLayout({
        edge: "left",
        collapsed: true,
        ballSide: "left",
        ballY: 0.25,
    });
    assertEquals(modernCollapsed, {
        edge: "left",
        collapsed: true,
        ballSide: "left",
        ballY: 0.25,
    });

    // Out of bounds ballY clamped
    const clampedHigh = normalizeDockLayout({ ballY: 1.5 });
    assertEquals(clampedHigh.ballY, 1);

    const clampedLow = normalizeDockLayout({ ballY: -0.2 });
    assertEquals(clampedLow.ballY, 0);

    // Invalid fields fallback to expanded defaults
    const fallback = normalizeDockLayout({
        edge: "diagonal",
        collapsed: "yes",
        ballSide: "center",
        ballY: Number.NaN,
    });
    assertEquals(fallback, DEFAULT_DOCK_LAYOUT);
});

Deno.test("shared/dock: legacy fixed layout remains expanded after migration", () => {
    const restored = normalizeDockLayout({
        edge: "right",
        mode: "fixed",
        collapsed: true,
        ballSide: "right",
        ballY: 0.75,
    });

    assertEquals(restored.collapsed, false);
    assertEquals(restored.edge, "right");
    assertEquals(restored.ballSide, "right");
    assertEquals(restored.ballY, 0.75);
});
