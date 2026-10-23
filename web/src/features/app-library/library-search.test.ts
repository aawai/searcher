import { assertEquals } from "@std/assert";
import { matchLibrary } from "./library-search.ts";

const apps = [
    { name: "GitHub", url: "https://github.com" },
    { name: "Git 手册", url: "https://git-scm.com" },
    { name: "GitHub", url: "https://github.com" },
    { name: "Docs", url: "https://example.org/gitbook" },
];
const folders = [
    { id: "dev", name: "开发 Git" },
    { id: "fun", name: "娱乐" },
];

Deno.test("library search lists matching folders before apps", () => {
    assertEquals(
        matchLibrary("git", apps, folders).map((m) =>
            m.type === "folder" ? `folder:${m.folder.id}` : m.app.name
        ),
        ["folder:dev", "GitHub", "Git 手册", "Docs"],
    );
});

Deno.test("a folder name alone is enough to surface the folder", () => {
    const matches = matchLibrary("娱", apps, folders);
    assertEquals(matches.length, 1);
    assertEquals(matches[0].type === "folder" && matches[0].folder.id, "fun");
});

Deno.test("library search is case-insensitive, ignores blanks and respects the limit", () => {
    assertEquals(matchLibrary("   ", apps, folders), []);
    assertEquals(matchLibrary("GITHUB", apps, folders).length, 1);
    assertEquals(matchLibrary("git", apps, folders, 2).length, 2);
    assertEquals(matchLibrary("nothing", apps, folders), []);
});
