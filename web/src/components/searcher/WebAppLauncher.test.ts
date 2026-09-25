import { assertEquals } from "@std/assert";
import { type LauncherApp, launcherTiles } from "./launcherTiles.ts";

Deno.test("grouped apps form one folder with every current member in app order", () => {
    const app = (id: string, groupId: string | null): LauncherApp => ({
        id,
        name: id,
        url: `https://${id}.example/`,
        groupId,
        isPinned: false,
    });
    const apps = [
        app("first", "work"),
        app("solo", null),
        app("second", "work"),
        app("orphan", "removed"),
    ];
    const groups = [{ id: "work", name: "工作" }];

    const tiles = launcherTiles(apps, groups);
    assertEquals(tiles.map((tile) => tile.id), [
        "folder:work",
        "solo",
        "orphan",
    ]);
    assertEquals(tiles[0].apps?.map((item) => item.id), ["first", "second"]);
    assertEquals(tiles[0].group?.name, "工作");
    assertEquals(
        launcherTiles([apps[2]], groups)[0].apps?.map((item) => item.id),
        ["second"],
    );
});
