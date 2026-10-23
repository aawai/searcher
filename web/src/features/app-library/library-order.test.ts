import { assertEquals } from "@std/assert";
import { nextAppSortOrder, nextFolderSortOrder } from "./library-order.ts";

const apps = [
    { id: "a", groupId: null, sortOrder: 0 },
    { id: "b", groupId: null, sortOrder: 3 },
    { id: "c", groupId: "dev", sortOrder: 5 },
    { id: "d", groupId: "dev", sortOrder: 6 },
];
const groups = [{ id: "dev", sortOrder: 4 }];

Deno.test("joining a folder goes after its last member, ignoring the moving app", () => {
    assertEquals(nextAppSortOrder(apps, groups, "dev"), 7);
    assertEquals(nextAppSortOrder(apps, groups, "dev", "d"), 6);
    assertEquals(nextAppSortOrder(apps, groups, "empty"), 0);
});

Deno.test("leaving a folder goes after every root app and folder", () => {
    assertEquals(nextAppSortOrder(apps, groups, null, "c"), 5);
    assertEquals(
        nextAppSortOrder(apps, [{ id: "dev", sortOrder: 9 }], null),
        10,
    );
    assertEquals(nextAppSortOrder([], [], null), 0);
});

Deno.test("a new folder is appended to the mixed root order", () => {
    assertEquals(nextFolderSortOrder(apps, groups), 5);
});
