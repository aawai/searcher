import { assertEquals } from "@std/assert";
import {
    type LauncherApp,
    launcherTiles,
    mergeVisibleOrder,
} from "./launcherTiles.ts";
import { computeEffectiveColumns } from "./WebAppLauncher.tsx";
import { calculateDesktopLayout } from "./desktopLayout.ts";

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

Deno.test("sorting a filtered desktop preserves hidden apps in canonical order", () => {
    assertEquals(
        mergeVisibleOrder(["A", "hidden1", "B", "hidden2", "C"], [
            "C",
            "A",
            "B",
        ]),
        ["C", "hidden1", "A", "hidden2", "B"],
    );
});

Deno.test("a large folder leaves first-row space for following websites", () => {
    const columns = computeEffectiveColumns({
        tilesCount: 3,
        columns: 5,
        showFolders: true,
        largeFolderCount: 1,
    });
    const placement = calculateDesktopLayout([
        { id: "first", cols: 1, rows: 1 },
        { id: "folder", cols: 2, rows: 2 },
        { id: "next", cols: 1, rows: 1 },
    ], columns);
    assertEquals(placement.map(({ id, row, col }) => ({ id, row, col })), [
        { id: "first", row: 0, col: 0 },
        { id: "folder", row: 0, col: 1 },
        { id: "next", row: 0, col: 3 },
    ]);
});
