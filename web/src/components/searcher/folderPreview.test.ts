import { assertEquals } from "@std/assert";
import { folderPreview } from "./folderPreview.ts";
import type { LauncherApp } from "./launcherTiles.ts";

const apps = (n: number): LauncherApp[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `a${i}`,
        name: `App ${i}`,
        url: `https://example.com/${i}`,
    }));

const run = (n: number, large = true) =>
    folderPreview(apps(n), { large, folderName: "工作" });

Deno.test("large folder: up to 9 members occupy ordered 3x3 slots", () => {
    for (const n of [0, 1, 4, 9]) {
        const p = run(n);
        assertEquals(p.clickable.length, n);
        assertEquals(p.remainder, []);
        assertEquals(p.remainderPreview, []);
        assertEquals(p.remainderLabel, null);
        assertEquals(p.folderLabel, `打开文件夹 工作，${n} 个应用`);
    }
});

Deno.test("large folder: more than 9 keeps 8 members plus remainder", () => {
    const p10 = run(10);
    assertEquals(p10.clickable.map((a) => a.id), apps(8).map((a) => a.id));
    assertEquals(p10.remainder.map((a) => a.id), ["a8", "a9"]);
    assertEquals(p10.remainderPreview.length, 2);
    assertEquals(p10.remainderLabel, "打开文件夹 工作，另有 2 个应用");
    assertEquals(p10.folderLabel, "打开文件夹 工作，10 个应用");

    const p20 = run(20);
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

Deno.test("large folder: 12 members put the last four in the ninth slot", () => {
    const preview = run(12);
    assertEquals(preview.clickable.length, 8);
    assertEquals(preview.remainder.map((app) => app.id), [
        "a8",
        "a9",
        "a10",
        "a11",
    ]);
    assertEquals(preview.remainderLabel, "打开文件夹 工作，另有 4 个应用");
});

Deno.test("small folder has no clickable icons, only a 4-item mini preview", () => {
    const p = run(20, false);
    assertEquals(p.clickable, []);
    assertEquals(p.remainder, []);
    assertEquals(p.remainderLabel, null);
    assertEquals(p.miniPreview.map((a) => a.id), ["a0", "a1", "a2", "a3"]);
    assertEquals(p.folderLabel, "打开文件夹 工作，20 个应用");
    assertEquals(run(0, false).miniPreview, []);
    assertEquals(run(9).miniPreview, []);
});
