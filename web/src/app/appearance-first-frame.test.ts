import { assertEquals } from "@std/assert";
import {
    readFirstFrame,
    readFirstFrameOwner,
    writeFirstFrame,
    writeFirstFrameOwner,
} from "./appearance-first-frame.ts";
import { normalizeAppearance } from "./state.tsx";

class MemoryStorage implements Storage {
    readonly items = new Map<string, string>();
    failWrites = false;
    get length() {
        return this.items.size;
    }
    clear() {
        this.items.clear();
    }
    getItem(key: string) {
        return this.items.get(key) ?? null;
    }
    key(index: number) {
        return [...this.items.keys()][index] ?? null;
    }
    removeItem(key: string) {
        this.items.delete(key);
    }
    setItem(key: string, value: string) {
        if (this.failWrites) {
            throw new DOMException("Storage is full", "QuotaExceededError");
        }
        this.items.set(key, value);
    }
}

Deno.test("First frame: each owner paints its own snapshot and the last confirmed owner is chosen", () => {
    const storage = new MemoryStorage();
    const wallpaper = "data:image/png;base64,aGVsbG8=";
    writeFirstFrame(
        storage,
        null,
        normalizeAppearance({ theme: "high-contrast-dark", wallpaper }),
    );
    writeFirstFrame(
        storage,
        "user-a",
        normalizeAppearance({
            theme: "light",
            accent: "rose",
            shape: "pill",
            glassIntensity: "off",
            tabIcon: "keycap",
        }),
    );

    assertEquals(readFirstFrameOwner(storage), null);
    assertEquals(readFirstFrame(storage, null).theme, "high-contrast-dark");
    writeFirstFrameOwner(storage, "user-a");
    assertEquals(readFirstFrameOwner(storage), "user-a");
    assertEquals(readFirstFrame(storage, "user-a"), {
        theme: "light",
        accent: "rose",
        shape: "pill",
        glassIntensity: "off",
        tabIcon: "keycap",
    });
    // An account never seen on this device starts from the defaults, not
    // from another owner's snapshot.
    assertEquals(readFirstFrame(storage, "user-b").theme, "system");
    // Local wallpapers stay in IndexedDB; the synchronous store keeps only the
    // first-frame fields.
    assertEquals(
        [...storage.items.values()].some((value) => value.includes("data:")),
        false,
    );
    writeFirstFrameOwner(storage, null);
    assertEquals(readFirstFrameOwner(storage), null);
});

Deno.test("First frame: corrupt, missing or unwritable storage falls back to the default appearance", () => {
    const storage = new MemoryStorage();
    storage.items.set("first-frame:owner", "{");
    storage.items.set(
        "first-frame:appearance:anonymous",
        JSON.stringify({ theme: "sepia", shape: "square", accent: 7 }),
    );
    assertEquals(readFirstFrameOwner(storage), null);
    assertEquals(readFirstFrame(storage, null), {
        theme: "system",
        accent: "wallpaper",
        shape: "rounded",
        glassIntensity: "regular",
        tabIcon: "editorial",
    });
    assertEquals(readFirstFrame(null, null).theme, "system");

    storage.failWrites = true;
    writeFirstFrame(storage, null, normalizeAppearance({ theme: "dark" }));
    writeFirstFrameOwner(storage, "user-a");
    assertEquals(readFirstFrameOwner(storage), null);
});
