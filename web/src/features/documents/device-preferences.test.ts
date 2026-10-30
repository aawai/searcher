import { assertEquals } from "@std/assert";
import {
    type DevicePreferenceStorage,
    effectivePaneWidth,
    OUTLINE_WIDTH,
    readDevicePreferences,
    readOutlineWidth,
    readSidebarCollapsed,
    readSidebarWidth,
    resolveToolbarCollapsed,
    SIDEBAR_WIDTH,
    writeOutlineOpen,
    writeOutlineWidth,
    writeSidebarCollapsed,
    writeSidebarWidth,
    writeToolbarCollapsed,
} from "./device-preferences.ts";

function memoryStorage(): DevicePreferenceStorage {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
    };
}

Deno.test("device preferences: unset toolbar follows width and pointer; outline defaults closed", () => {
    const preferences = readDevicePreferences(memoryStorage(), "alice");
    assertEquals(preferences, { toolbarCollapsed: null, outlineOpen: false });
    assertEquals(
        resolveToolbarCollapsed(preferences.toolbarCollapsed, 767, false),
        true,
    );
    assertEquals(
        resolveToolbarCollapsed(preferences.toolbarCollapsed, 768, false),
        false,
    );
    assertEquals(
        resolveToolbarCollapsed(preferences.toolbarCollapsed, 1440, true),
        true,
    );
});

Deno.test("device preferences: explicit toolbar choice overrides device defaults", () => {
    const storage = memoryStorage();
    writeToolbarCollapsed(storage, "alice", false);
    assertEquals(
        resolveToolbarCollapsed(
            readDevicePreferences(storage, "alice").toolbarCollapsed,
            390,
            true,
        ),
        false,
    );
    writeToolbarCollapsed(storage, "alice", true);
    assertEquals(
        resolveToolbarCollapsed(
            readDevicePreferences(storage, "alice").toolbarCollapsed,
            1440,
            false,
        ),
        true,
    );
});

Deno.test("device preferences: choices persist independently per account and device", () => {
    const device = memoryStorage();
    const otherDevice = memoryStorage();
    writeToolbarCollapsed(device, "alice", true);
    writeOutlineOpen(device, "alice", true);
    writeToolbarCollapsed(device, "bob", false);
    assertEquals(readDevicePreferences(device, "alice"), {
        toolbarCollapsed: true,
        outlineOpen: true,
    });
    assertEquals(readDevicePreferences(device, "bob"), {
        toolbarCollapsed: false,
        outlineOpen: false,
    });
    assertEquals(readDevicePreferences(otherDevice, "alice"), {
        toolbarCollapsed: null,
        outlineOpen: false,
    });
    writeOutlineOpen(device, "alice", false);
    assertEquals(readDevicePreferences(device, "alice"), {
        toolbarCollapsed: true,
        outlineOpen: false,
    });
});

Deno.test("sidebar preference defaults open and is isolated by account and device", () => {
    const device = memoryStorage();
    const otherDevice = memoryStorage();
    assertEquals(readSidebarCollapsed(device, "alice"), false);
    writeSidebarCollapsed(device, "alice", true);
    assertEquals(readSidebarCollapsed(device, "alice"), true);
    assertEquals(readSidebarCollapsed(device, "bob"), false);
    assertEquals(readSidebarCollapsed(otherDevice, "alice"), false);
    writeSidebarCollapsed(device, "alice", false);
    assertEquals(readSidebarCollapsed(device, "alice"), false);
    assertEquals(readSidebarCollapsed(null, "alice"), false);
});

Deno.test("device preferences: invalid values and unavailable storage use defaults", () => {
    const storage: DevicePreferenceStorage = {
        getItem: () => "invalid",
        setItem: () => {
            throw new Error("unavailable");
        },
    };
    assertEquals(readDevicePreferences(storage, "alice"), {
        toolbarCollapsed: null,
        outlineOpen: false,
    });
    writeToolbarCollapsed(storage, "alice", true);
    writeOutlineOpen(storage, "alice", true);
    const unavailable: DevicePreferenceStorage = {
        getItem: () => {
            throw new Error("unavailable");
        },
        setItem: () => {
            throw new Error("unavailable");
        },
    };
    assertEquals(readDevicePreferences(unavailable, "alice"), {
        toolbarCollapsed: null,
        outlineOpen: false,
    });
    assertEquals(readDevicePreferences(null, "alice"), {
        toolbarCollapsed: null,
        outlineOpen: false,
    });
});

Deno.test("pane widths persist per account and device and clamp invalid bounds", () => {
    const storage = memoryStorage();
    const other = memoryStorage();
    assertEquals(readSidebarWidth(storage, "alice"), 240);
    assertEquals(readOutlineWidth(storage, "alice"), 260);
    writeSidebarWidth(storage, "alice", 500);
    writeOutlineWidth(storage, "alice", 100);
    assertEquals(readSidebarWidth(storage, "alice"), 400);
    assertEquals(readOutlineWidth(storage, "alice"), 180);
    assertEquals(readSidebarWidth(storage, "bob"), 240);
    assertEquals(readOutlineWidth(other, "alice"), 260);
    storage.setItem("document:device:alice:sidebarWidth", "NaN");
    assertEquals(readSidebarWidth(storage, "alice"), 240);
    storage.setItem("document:device:alice:outlineWidth", "999");
    assertEquals(readOutlineWidth(storage, "alice"), 400);
    assertEquals(readSidebarWidth(null, "alice"), 240);
});

Deno.test("effective pane width respects available space without changing the saved width", () => {
    assertEquals(effectivePaneWidth(400, 0, 718, SIDEBAR_WIDTH), 400);
    assertEquals(effectivePaneWidth(400, 1118, 718, SIDEBAR_WIDTH), 400);
    assertEquals(effectivePaneWidth(400, 958, 718, SIDEBAR_WIDTH), 240);
    assertEquals(effectivePaneWidth(400, 898, 718, SIDEBAR_WIDTH), 180);
    assertEquals(effectivePaneWidth(400, 800, 718, SIDEBAR_WIDTH), 180);
    assertEquals(effectivePaneWidth(260, 900, 640, OUTLINE_WIDTH), 260);
    assertEquals(effectivePaneWidth(260, 819, 640, OUTLINE_WIDTH), 180);
    assertEquals(effectivePaneWidth(260, 1200, 640, OUTLINE_WIDTH), 260);
});

Deno.test("pane width constants mirror design tokens", async () => {
    const css = await Deno.readTextFile(
        new URL("../../design-system/tokens.css", import.meta.url),
    );
    for (
        const [name, value] of [
            ["notes-sidebar-width", SIDEBAR_WIDTH.default],
            ["notes-sidebar-width-min", SIDEBAR_WIDTH.min],
            ["notes-sidebar-width-max", SIDEBAR_WIDTH.max],
            ["document-outline-width", OUTLINE_WIDTH.default],
            ["document-outline-width-min", OUTLINE_WIDTH.min],
            ["document-outline-width-max", OUTLINE_WIDTH.max],
        ] as const
    ) {
        assertEquals(css.includes(`--${name}: ${value}px;`), true);
    }
});
