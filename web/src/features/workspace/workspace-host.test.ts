import { assertEquals } from "@std/assert";
import {
    initialWorkspaceHost,
    workspaceHostReducer,
} from "./workspace-host.ts";

Deno.test("Workspace Host: simultaneous domains retain nested routes, query and Back independently", () => {
    let host = workspaceHostReducer(initialWorkspaceHost, {
        type: "domain",
        kind: "apps",
        action: { type: "navigate", route: { view: "apps/root" } },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "query", workspace: "apps", value: "docs" },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: {
            type: "navigate",
            route: { view: "apps/create", groupId: "folder" },
        },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "notes",
        action: { type: "navigate", route: { view: "notes/root" } },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "notes",
        action: { type: "navigate", route: { view: "notes/edit", id: "note" } },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "notes",
        action: { type: "back" },
    });
    assertEquals(host.models.notes.route, { view: "notes/root" });
    assertEquals(host.models.apps.route, {
        view: "apps/create",
        groupId: "folder",
    });
    assertEquals(host.models.apps.queries.apps, "docs");
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "notes",
        action: { type: "close" },
    });
    assertEquals(host.activeKind, "apps");
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "back" },
    });
    assertEquals(host.models.apps.route, { view: "apps/root" });
    assertEquals(host.models.apps.queries.apps, "docs");
    host = workspaceHostReducer(host, { type: "reset" });
    assertEquals(host.models.apps.route, { view: "closed" });
    assertEquals(host.models.notes.route, { view: "closed" });
    assertEquals(host.models.apps.queries.apps, "");
    assertEquals(host.activeKind, null);
});
