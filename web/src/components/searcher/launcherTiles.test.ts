import { assertEquals } from "@std/assert";
import {
    type LauncherApp,
    type LauncherGroup,
    launcherTiles,
    mergeVisibleOrder,
    reorderRootTiles,
} from "./launcherTiles.ts";

Deno.test("grouped apps form one folder with every current member in app order", () => {
    const app = (id: string, groupId: string | null): LauncherApp => ({
        id,
        name: id,
        url: `https://${id}.example/`,
        groupId,
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

Deno.test("empty folders participate in root mixed layout and explicit sortOrder", () => {
    const app = (id: string, sortOrder: number): LauncherApp => ({
        id,
        name: id,
        url: `https://${id}.example/`,
        sortOrder,
    });
    const groups: LauncherGroup[] = [
        { id: "empty-tools", name: "Tools", sortOrder: 0 },
        { id: "empty-social", name: "Social", sortOrder: 2 },
    ];
    const apps: LauncherApp[] = [
        app("app-github", 1),
        app("app-linear", 3),
    ];

    const tiles = launcherTiles(apps, groups);
    assertEquals(tiles.map((t) => t.id), [
        "folder:empty-tools",
        "app-github",
        "folder:empty-social",
        "app-linear",
    ]);
    assertEquals(tiles[0].type, "folder");
    assertEquals(tiles[1].type, "app");
    assertEquals(tiles[2].type, "folder");
    assertEquals(tiles[3].type, "app");
});

Deno.test("reorderRootTiles normalizes sequential ranks across apps and folders", () => {
    const app = (id: string, sortOrder: number): LauncherApp => ({
        id,
        name: id,
        url: `https://${id}.example/`,
        sortOrder,
    });
    const groups: LauncherGroup[] = [
        { id: "folder-dev", name: "Dev", sortOrder: 0 },
    ];
    const apps: LauncherApp[] = [
        app("app-1", 1),
        app("app-2", 2),
    ];
    const tiles = launcherTiles(apps, groups);

    const { reorderedTiles, appUpdates, groupUpdates } = reorderRootTiles(
        tiles,
        2,
        0,
    );
    assertEquals(reorderedTiles.map((t) => t.id), [
        "app-2",
        "folder:folder-dev",
        "app-1",
    ]);
    assertEquals(appUpdates, [
        { id: "app-2", sortOrder: 0 },
        { id: "app-1", sortOrder: 2 },
    ]);
    assertEquals(groupUpdates, [
        { id: "folder-dev", sortOrder: 1 },
    ]);
});
