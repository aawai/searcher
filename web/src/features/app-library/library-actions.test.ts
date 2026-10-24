import { assertEquals } from "@std/assert";
import type { SetStateAction } from "react";
import type { ExtendedWebApp, WebAppGroup } from "./library-types.ts";
import { launcherTiles } from "../../components/searcher/launcherTiles.ts";
import { createLibraryActions } from "./library-actions.ts";

function app(id: string, groupId: string | null, sortOrder: number) {
    return {
        id,
        name: id,
        url: `https://${id}.example/`,
        groupId,
        sortOrder,
        isHomeFixed: false,
    } satisfies ExtendedWebApp;
}

function group(id: string, sortOrder: number, name = id): WebAppGroup {
    return {
        id,
        userId: "u",
        name,
        folderSize: "small",
        sortOrder,
        isHomeFixed: false,
        createdAt: 0,
        updatedAt: 0,
    };
}

function harness(
    initialApps: ExtendedWebApp[],
    initialGroups: WebAppGroup[],
    fail = false,
) {
    const state = { apps: initialApps, groups: initialGroups };
    const persisted: Array<{ path: string; body: unknown }> = [];
    const requests: Array<{ path: string; method?: string; body: unknown }> =
        [];
    const errors: unknown[] = [];
    const deleted: string[] = [];
    const apply = <T>(current: T, next: SetStateAction<T>) =>
        typeof next === "function" ? (next as (v: T) => T)(current) : next;
    const actions = createLibraryActions({
        getApps: () => state.apps,
        getGroups: () => state.groups,
        setApps: (next) => {
            state.apps = apply(state.apps, next);
        },
        setGroups: (next) => {
            state.groups = apply(state.groups, next);
        },
        persist: (path, init) => {
            persisted.push({
                path,
                body: init.body ? JSON.parse(String(init.body)) : undefined,
            });
            return Promise.resolve();
        },
        request: <T>(path: string, init: RequestInit = {}) => {
            const body = init.body ? JSON.parse(String(init.body)) : undefined;
            requests.push({ path, method: init.method, body });
            if (fail) return Promise.reject(new Error("boom"));
            if (init.method === "POST") {
                return Promise.resolve(
                    {
                        ...group("new", body.sortOrder),
                        name: body.name,
                        isHomeFixed: body.isHomeFixed,
                    } as T,
                );
            }
            if (init.method === "PATCH") {
                return Promise.resolve(
                    {
                        ...state.groups.find((g) => path.endsWith(g.id))!,
                        ...body,
                    } as T,
                );
            }
            return Promise.resolve(undefined as T);
        },
        clearError: () => {},
        reportError: (cause) => errors.push(cause),
        onFolderDeleted: (id) => deleted.push(id),
    });
    return { state, actions, persisted, requests, errors, deleted };
}

Deno.test("moving an app into a folder appends it and persists the same order", async () => {
    const h = harness(
        [app("a", null, 0), app("b", "dev", 4), app("c", "dev", 5)],
        [group("dev", 1)],
    );
    await h.actions.moveApp(h.state.apps[0], "dev");
    assertEquals(h.state.apps[0].groupId, "dev");
    assertEquals(h.state.apps[0].sortOrder, 6);
    assertEquals(h.persisted, [{
        path: "/api/webapps/a",
        body: { groupId: "dev", sortOrder: 6 },
    }]);
});

Deno.test("moving an app out of a folder appends it after root apps and folders", async () => {
    const h = harness(
        [app("a", null, 0), app("b", "dev", 0)],
        [group("dev", 7)],
    );
    await h.actions.moveApp(h.state.apps[1], null);
    assertEquals(h.state.apps[1].groupId, null);
    assertEquals(h.state.apps[1].sortOrder, 8);
});

Deno.test("root reorder writes one atomic snapshot across apps and folders", async () => {
    const h = harness(
        [app("a", null, 0), app("b", null, 1)],
        [group("dev", 2)],
    );
    const tiles = launcherTiles(h.state.apps, h.state.groups);
    await h.actions.reorderRoot([tiles[2], tiles[0], tiles[1]]);
    assertEquals(h.persisted, [{
        path: "/api/webapps/reorder",
        body: {
            items: [
                { id: "a", sortOrder: 1 },
                { id: "b", sortOrder: 2 },
            ],
            groups: [{ id: "dev", sortOrder: 0 }],
        },
    }]);
    assertEquals(h.state.groups[0].sortOrder, 0);
});

Deno.test("folder reorder renumbers its members from zero", async () => {
    const h = harness(
        [app("x", "dev", 3), app("y", "dev", 4)],
        [group("dev", 0)],
    );
    await h.actions.reorderFolder(["y", "x"]);
    assertEquals(h.persisted[0].body, {
        items: [{ id: "y", sortOrder: 0 }, { id: "x", sortOrder: 1 }],
    });
    assertEquals(h.state.apps.map((item) => item.sortOrder), [1, 0]);
});

Deno.test("deleting a folder returns members to the root end in folder order", async () => {
    const h = harness(
        [app("a", null, 0), app("m2", "dev", 9), app("m1", "dev", 2)],
        [group("dev", 1)],
    );
    await h.actions.deleteGroup(h.state.groups[0]);
    assertEquals(h.state.groups, []);
    const byId = new Map(h.state.apps.map((item) => [item.id, item]));
    assertEquals(byId.get("m1")?.groupId, null);
    assertEquals(byId.get("m1")?.sortOrder, 10);
    assertEquals(byId.get("m2")?.sortOrder, 11);
    assertEquals(h.deleted, ["dev"]);
});

Deno.test("a failed folder delete rolls the library back and reports the error", async () => {
    const h = harness(
        [app("m1", "dev", 0)],
        [group("dev", 0)],
        true,
    );
    await h.actions.deleteGroup(h.state.groups[0]);
    assertEquals(h.state.groups.map((item) => item.id), ["dev"]);
    assertEquals(h.state.apps[0].groupId, "dev");
    assertEquals(h.errors.length, 1);
});

Deno.test("rename and resize apply optimistically and roll back on failure", async () => {
    const ok = harness([], [group("dev", 0, "旧名")]);
    await ok.actions.renameGroup(ok.state.groups[0], "新名");
    assertEquals(ok.state.groups[0].name, "新名");
    await ok.actions.changeGroupSize(ok.state.groups[0], "large");
    assertEquals(ok.state.groups[0].folderSize, "large");

    const bad = harness([], [group("dev", 0, "旧名")], true);
    await bad.actions.renameGroup(bad.state.groups[0], "新名");
    assertEquals(bad.state.groups[0].name, "旧名");
    await bad.actions.changeGroupSize(bad.state.groups[0], "large");
    assertEquals(bad.state.groups[0].folderSize, "small");
    assertEquals(bad.errors.length, 2);
});

Deno.test("a new folder is appended to the mixed root order", async () => {
    const h = harness([app("a", null, 0), app("b", null, 4)], [group("g", 2)]);
    await h.actions.createGroup("新文件夹");
    assertEquals(h.requests[0].body, {
        name: "新文件夹",
        sortOrder: 5,
        isHomeFixed: false,
        appIds: [],
    });
    assertEquals(h.state.groups.map((item) => item.id), ["g", "new"]);
});

Deno.test("home creates a pinned folder and moves the dropped apps into it", async () => {
    const h = harness(
        [app("a", null, 0), app("b", null, 1)],
        [],
    );
    await h.actions.createGroup("新建文件夹", {
        isHomeFixed: true,
        memberIds: ["b", "a"],
    });
    assertEquals(h.requests[0].body, {
        name: "新建文件夹",
        sortOrder: 2,
        isHomeFixed: true,
        appIds: ["b", "a"],
    });
    assertEquals(h.state.groups[0].isHomeFixed, true);
    assertEquals(
        h.state.apps.map((item) => [item.id, item.groupId, item.sortOrder]),
        [["a", "new", 1], ["b", "new", 0]],
    );
});

Deno.test("app and folder pin state change optimistically and roll back on failure", async () => {
    const h = harness([app("a", null, 0)], [group("dev", 1)]);
    await h.actions.setAppHomeFixed(h.state.apps[0], true);
    assertEquals(h.state.apps[0].isHomeFixed, true);
    assertEquals(h.persisted, [{
        path: "/api/webapps/a",
        body: { isHomeFixed: true },
    }]);
    await h.actions.setGroupHomeFixed(h.state.groups[0], true);
    assertEquals(h.state.groups[0].isHomeFixed, true);
    assertEquals(h.requests[0].body, { isHomeFixed: true });

    const bad = harness([app("a", null, 0)], [group("dev", 1)], true);
    await bad.actions.setGroupHomeFixed(bad.state.groups[0], true);
    assertEquals(bad.state.groups[0].isHomeFixed, false);
    assertEquals(bad.errors.length, 1);
});
