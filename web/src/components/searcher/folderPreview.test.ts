import { assertEquals } from "@std/assert";
import { folderPreview } from "./folderPreview.ts";
import type { LauncherApp } from "./launcherTiles.ts";

const apps = (n: number): LauncherApp[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `a${i}`,
        name: `App ${i}`,
        url: `https://example.com/${i}`,
    }));

const run = (n: number, touch: boolean, large = true) =>
    folderPreview(apps(n), { large, touch, folderName: "工作" });

Deno.test("large folder, non-touch: up to 9 members are all clickable", () => {
    for (const n of [0, 1, 4, 9]) {
        const p = run(n, false);
        assertEquals(p.clickable.length, n);
        assertEquals(p.remainder, []);
        assertEquals(p.remainderPreview, []);
        assertEquals(p.remainderLabel, null);
        assertEquals(p.folderLabel, `打开文件夹 工作，${n} 个应用`);
    }
});

Deno.test("large folder, non-touch: more than 9 keeps 8 clickable plus remainder", () => {
    const p10 = run(10, false);
    assertEquals(p10.clickable.map((a) => a.id), apps(8).map((a) => a.id));
    assertEquals(p10.remainder.map((a) => a.id), ["a8", "a9"]);
    assertEquals(p10.remainderPreview.length, 2);
    assertEquals(p10.remainderLabel, "打开文件夹 工作，另有 2 个应用");
    assertEquals(p10.folderLabel, "打开文件夹 工作，10 个应用");

    const p20 = run(20, false);
    assertEquals(p20.clickable.length, 8);
    assertEquals(p20.remainder.length, 12);
    assertEquals(p20.remainderPreview.map((a) => a.id), [
        "a8",
        "a9",
        "a10",
        "a11",
    ]);
    assertEquals(p20.remainderLabel, "打开文件夹 工作，另有 12 个应用");
});

Deno.test("large folder, touch: up to 4 clickable, else 3 plus remainder", () => {
    for (const n of [0, 1, 4]) {
        const p = run(n, true);
        assertEquals(p.clickable.length, n);
        assertEquals(p.remainderLabel, null);
    }
    const p9 = run(9, true);
    assertEquals(p9.clickable.length, 3);
    assertEquals(p9.remainder.length, 6);
    assertEquals(p9.remainderPreview.length, 4);
    assertEquals(p9.remainderLabel, "打开文件夹 工作，另有 6 个应用");
    const p10 = run(10, true);
    assertEquals(p10.clickable.length, 3);
    assertEquals(p10.remainder.length, 7);
    const p20 = run(20, true);
    assertEquals(p20.clickable.length, 3);
    assertEquals(p20.remainder.length, 17);
    assertEquals(p20.remainderPreview.map((a) => a.id), [
        "a3",
        "a4",
        "a5",
        "a6",
    ]);
});

Deno.test("small folder has no clickable icons, only a 4-item mini preview", () => {
    for (const touch of [false, true]) {
        const p = run(20, touch, false);
        assertEquals(p.clickable, []);
        assertEquals(p.remainder, []);
        assertEquals(p.remainderLabel, null);
        assertEquals(p.miniPreview.map((a) => a.id), ["a0", "a1", "a2", "a3"]);
        assertEquals(p.folderLabel, "打开文件夹 工作，20 个应用");
    }
    assertEquals(run(0, false, false).miniPreview, []);
    assertEquals(run(9, false).miniPreview, []);
});
