import { assertEquals } from "@std/assert";
import {
    initialWorkspaceHost,
    workspaceHostReducer,
} from "./workspace-host.ts";

Deno.test("Workspace Host: simultaneous domains retain nested routes, query and Back independently", () => {
    let host = workspaceHostReducer(initialWorkspaceHost, {
        type: "open",
        kind: "apps",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "query", value: "docs" },
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
        type: "open",
        kind: "notes",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "notes",
        action: { type: "query", value: "ideas" },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "notes",
        action: {
            type: "navigate",
            route: { view: "notes/edit", id: "note-1" },
        },
    });

    // Both domains are open simultaneously
    assertEquals(host.open.apps, true);
    assertEquals(host.open.notes, true);
    assertEquals(host.activeKind, "notes");

    // Notes can navigate Back independently
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "notes",
        action: { type: "back" },
    });
    assertEquals(host.models.notes.route, { view: "notes/root" });
    assertEquals(host.models.notes.query, "ideas");

    // Apps domain remains in nested create with its own query
    assertEquals(host.models.apps.route, {
        view: "apps/create",
        groupId: "folder",
    });
    assertEquals(host.models.apps.query, "docs");

    // Host closes notes: activeKind switches back to apps, notes route returns to root, query preserved
    host = workspaceHostReducer(host, {
        type: "close",
        kind: "notes",
    });
    assertEquals(host.open.notes, false);
    assertEquals(host.open.apps, true);
    assertEquals(host.activeKind, null);
    assertEquals(host.models.notes.route, { view: "notes/root" });
    assertEquals(host.models.notes.query, "ideas");

    // Apps navigates Back to root
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "back" },
    });
    assertEquals(host.models.apps.route, { view: "apps/root" });
    assertEquals(host.models.apps.query, "docs");

    // Re-opening notes preserves its query at root
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "notes",
    });
    assertEquals(host.open.notes, true);
    assertEquals(host.models.notes.route, { view: "notes/root" });
    assertEquals(host.models.notes.query, "ideas");

    // Full host reset
    host = workspaceHostReducer(host, { type: "reset" });
    assertEquals(host.models.apps.route, { view: "apps/root" });
    assertEquals(host.models.notes.route, { view: "notes/root" });
    assertEquals(host.models.apps.query, "");
    assertEquals(host.models.notes.query, "");
    assertEquals(host.open.apps, false);
    assertEquals(host.open.notes, false);
    assertEquals(host.activeKind, null);
});

Deno.test("Workspace Host: normal close and reopen retains root positioning and query behavior", () => {
    let host = workspaceHostReducer(initialWorkspaceHost, {
        type: "open",
        kind: "apps",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "query", value: "search-text" },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: {
            type: "navigate",
            route: { view: "apps/edit", id: "app-42" },
        },
    });
    assertEquals(host.models.apps.route, { view: "apps/edit", id: "app-42" });

    // Close apps
    host = workspaceHostReducer(host, { type: "close", kind: "apps" });
    assertEquals(host.open.apps, false);
    assertEquals(host.models.apps.route, { view: "apps/root" });
    assertEquals(host.models.apps.query, "search-text");

    // Re-open apps
    host = workspaceHostReducer(host, { type: "open", kind: "apps" });
    assertEquals(host.open.apps, true);
    assertEquals(host.models.apps.route, { view: "apps/root" });
    assertEquals(host.models.apps.query, "search-text");
});

Deno.test("Workspace Host: opening an already-open workspace only activates and does not reset nested route", () => {
    let host = workspaceHostReducer(initialWorkspaceHost, {
        type: "open",
        kind: "apps",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: {
            type: "navigate",
            route: { view: "apps/create", groupId: "dev-folder" },
        },
    });
    assertEquals(host.models.apps.route, {
        view: "apps/create",
        groupId: "dev-folder",
    });

    // Opening already-open apps activates it without resetting nested route
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "apps",
    });
    assertEquals(host.activeKind, "apps");
    assertEquals(host.open.apps, true);
    assertEquals(host.models.apps.route, {
        view: "apps/create",
        groupId: "dev-folder",
    });
});

Deno.test("Workspace Host: domain reset silently resets domain route/stack/query without altering host open state", () => {
    // Test 1: domain reset while open
    let host = workspaceHostReducer(initialWorkspaceHost, {
        type: "open",
        kind: "apps",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: {
            type: "navigate",
            route: { view: "apps/create", groupId: "f1" },
        },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "query", value: "test-query" },
    });
    assertEquals(host.open.apps, true);

    // Reset domain apps
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "reset" },
    });
    assertEquals(host.models.apps.route, { view: "apps/root" });
    assertEquals(host.models.apps.stack, []);
    assertEquals(host.models.apps.query, "");
    assertEquals(host.open.apps, true);

    // Test 2: domain reset while closed stays closed
    let closedHost = initialWorkspaceHost;
    assertEquals(closedHost.open.apps, false);
    closedHost = workspaceHostReducer(closedHost, {
        type: "domain",
        kind: "apps",
        action: { type: "reset" },
    });
    assertEquals(closedHost.open.apps, false);
    assertEquals(closedHost.activeKind, null);
    assertEquals(closedHost.models.apps.route, { view: "apps/root" });
});
