import { assertEquals } from "@std/assert";
import {
    type DevicePreferenceStorage,
    readDevicePreferences,
    resolveToolbarCollapsed,
    writeOutlineOpen,
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
    assertEquals(resolveToolbarCollapsed(preferences.toolbarCollapsed, 767, false), true);
    assertEquals(resolveToolbarCollapsed(preferences.toolbarCollapsed, 768, false), false);
    assertEquals(resolveToolbarCollapsed(preferences.toolbarCollapsed, 1440, true), true);
});

Deno.test("device preferences: explicit toolbar choice overrides device defaults", () => {
    const storage = memoryStorage();
    writeToolbarCollapsed(storage, "alice", false);
    assertEquals(resolveToolbarCollapsed(readDevicePreferences(storage, "alice").toolbarCollapsed, 390, true), false);
    writeToolbarCollapsed(storage, "alice", true);
    assertEquals(resolveToolbarCollapsed(readDevicePreferences(storage, "alice").toolbarCollapsed, 1440, false), true);
});

Deno.test("device preferences: choices persist independently per account and device", () => {
    const device = memoryStorage();
    const otherDevice = memoryStorage();
    writeToolbarCollapsed(device, "alice", true);
    writeOutlineOpen(device, "alice", true);
    writeToolbarCollapsed(device, "bob", false);
    assertEquals(readDevicePreferences(device, "alice"), { toolbarCollapsed: true, outlineOpen: true });
    assertEquals(readDevicePreferences(device, "bob"), { toolbarCollapsed: false, outlineOpen: false });
    assertEquals(readDevicePreferences(otherDevice, "alice"), { toolbarCollapsed: null, outlineOpen: false });
    writeOutlineOpen(device, "alice", false);
    assertEquals(readDevicePreferences(device, "alice"), { toolbarCollapsed: true, outlineOpen: false });
});

Deno.test("device preferences: invalid values and unavailable storage use defaults", () => {
    const storage: DevicePreferenceStorage = {
        getItem: () => "invalid",
        setItem: () => { throw new Error("unavailable"); },
    };
    assertEquals(readDevicePreferences(storage, "alice"), { toolbarCollapsed: null, outlineOpen: false });
    writeToolbarCollapsed(storage, "alice", true);
    writeOutlineOpen(storage, "alice", true);
    const unavailable: DevicePreferenceStorage = {
        getItem: () => { throw new Error("unavailable"); },
        setItem: () => { throw new Error("unavailable"); },
    };
    assertEquals(readDevicePreferences(unavailable, "alice"), { toolbarCollapsed: null, outlineOpen: false });
    assertEquals(readDevicePreferences(null, "alice"), { toolbarCollapsed: null, outlineOpen: false });
});
