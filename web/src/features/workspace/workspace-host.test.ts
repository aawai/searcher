import { assertEquals } from "@std/assert";
import {
    initialWorkspaceHost,
    workspaceHostReducer,
} from "./workspace-host.ts";
import {
    initialAppsWorkspaceState,
    initialDocumentsWorkspaceState,
} from "./workspace-state.ts";

Deno.test("Workspace Host: simultaneous domains retain nested routes, query, scope and Back independently across both domains", () => {
    // Open Apps
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

    // Open Documents
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "documents",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "query", value: "specs" },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "scope",
            scope: { type: "notebook", notebookId: "nb-work" },
        },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "navigate",
            route: { view: "documents/edit", id: "doc-101" },
        },
    });

    // Both domains are open simultaneously
    assertEquals(host.open.apps, true);
    assertEquals(host.open.documents, true);
    assertEquals(host.activeKind, "documents");

    // Documents can navigate Back independently while preserving query and scope
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "back" },
    });
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.query, "specs");
    assertEquals(host.models.documents.scope, {
        type: "notebook",
        notebookId: "nb-work",
    });
    assertEquals(host.models.documents.stack, []);

    // Apps remains nested and unaffected
    assertEquals(host.models.apps.route, {
        view: "apps/create",
        groupId: "folder",
    });
    assertEquals(host.models.apps.query, "docs");

    // Apps domain remains in nested create with its own query
    assertEquals(host.models.apps.route, {
        view: "apps/create",
        groupId: "folder",
    });
    assertEquals(host.models.apps.query, "docs");

    // Host closes documents: documents route returns to root, query & scope preserved
    host = workspaceHostReducer(host, {
        type: "close",
        kind: "documents",
    });
    assertEquals(host.open.documents, false);
    assertEquals(host.open.apps, true);
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.query, "specs");
    assertEquals(host.models.documents.scope, {
        type: "notebook",
        notebookId: "nb-work",
    });

    // Apps navigates Back to root
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "back" },
    });
    assertEquals(host.models.apps.route, { view: "apps/root" });
    assertEquals(host.models.apps.query, "docs");

    // Re-opening documents preserves its query and scope at root
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "documents",
    });
    assertEquals(host.open.documents, true);
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.query, "specs");
    assertEquals(host.models.documents.scope, {
        type: "notebook",
        notebookId: "nb-work",
    });

    // Full host reset resets all domains including Docs scope back to "all"
    host = workspaceHostReducer(host, { type: "reset" });
    assertEquals(host.models.apps.route, { view: "apps/root" });
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.apps.query, "");
    assertEquals(host.models.documents.query, "");
    assertEquals(host.models.documents.scope, { type: "all" });
    assertEquals(host.open.apps, false);
    assertEquals(host.open.documents, false);
    assertEquals(host.activeKind, null);
});

Deno.test("Workspace Host: normal close and reopen retains root positioning, query, and scope for all domains", () => {
    // Test apps domain
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

    // Test documents domain
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "documents",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "query", value: "quarterly-report" },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "scope", scope: { type: "recent" } },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "navigate",
            route: { view: "documents/edit", id: "doc-q3" },
        },
    });
    assertEquals(host.models.documents.route, {
        view: "documents/edit",
        id: "doc-q3",
    });

    // Close documents
    host = workspaceHostReducer(host, { type: "close", kind: "documents" });
    assertEquals(host.open.documents, false);
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.query, "quarterly-report");
    assertEquals(host.models.documents.scope, { type: "recent" });

    // Re-open documents
    host = workspaceHostReducer(host, { type: "open", kind: "documents" });
    assertEquals(host.open.documents, true);
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.query, "quarterly-report");
    assertEquals(host.models.documents.scope, { type: "recent" });
});

Deno.test("Workspace Host: opening an already-open workspace only activates and does not reset nested route across domains", () => {
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

    // Open documents and navigate to nested route
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "documents",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "navigate",
            route: { view: "documents/edit", id: "doc-deep" },
        },
    });
    assertEquals(host.models.documents.route, {
        view: "documents/edit",
        id: "doc-deep",
    });

    // Switch active to apps
    host = workspaceHostReducer(host, {
        type: "activate",
        kind: "apps",
    });
    assertEquals(host.activeKind, "apps");
    assertEquals(host.open.documents, true);

    // Opening already-open documents only activates and preserves nested route
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "documents",
    });
    assertEquals(host.activeKind, "documents");
    assertEquals(host.open.documents, true);
    assertEquals(host.models.documents.route, {
        view: "documents/edit",
        id: "doc-deep",
    });
});

Deno.test("Workspace Host: opening a closed workspace normalizes route to root and clears stack", () => {
    // Construct state where documents is closed with nested route
    let host = workspaceHostReducer(initialWorkspaceHost, {
        type: "open",
        kind: "documents",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "navigate",
            route: { view: "documents/edit", id: "doc-nested" },
        },
    });
    assertEquals(host.models.documents.route, {
        view: "documents/edit",
        id: "doc-nested",
    });

    // Closing normalizes to root
    host = workspaceHostReducer(host, {
        type: "close",
        kind: "documents",
    });
    assertEquals(host.open.documents, false);
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.stack, []);

    // Re-opening stays at normalized root
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "documents",
    });
    assertEquals(host.open.documents, true);
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.stack, []);

    // If state somehow had a nested route while closed, opening explicitly normalizes
    const closedWithNestedRoute = {
        ...host,
        open: { ...host.open, documents: false },
        models: {
            ...host.models,
            documents: {
                ...host.models.documents,
                route: { view: "documents/edit" as const, id: "stale" },
                stack: [{ view: "documents/root" as const }],
            },
        },
    };
    const reopened = workspaceHostReducer(closedWithNestedRoute, {
        type: "open",
        kind: "documents",
    });
    assertEquals(reopened.open.documents, true);
    assertEquals(reopened.models.documents.route, { view: "documents/root" });
    assertEquals(reopened.models.documents.stack, []);
});

Deno.test("Workspace Host: documents scope is independent of query and backstack, defaulting to all", () => {
    // Default scope is "all"
    assertEquals(initialWorkspaceHost.models.documents.scope, { type: "all" });

    // Scope action while closed updates scope without opening or activating host
    let host = workspaceHostReducer(initialWorkspaceHost, {
        type: "domain",
        kind: "documents",
        action: {
            type: "scope",
            scope: { type: "recent" },
        },
    });
    assertEquals(host.open.documents, false);
    assertEquals(host.activeKind, null);
    assertEquals(host.models.documents.scope, { type: "recent" });

    // Open documents
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "documents",
    });
    assertEquals(host.open.documents, true);
    assertEquals(host.models.documents.scope, { type: "recent" });

    // Query and navigate
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "query", value: "architecture" },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "navigate",
            route: { view: "documents/edit", id: "doc-arch-1" },
        },
    });
    assertEquals(host.models.documents.scope, { type: "recent" });
    assertEquals(host.models.documents.query, "architecture");
    assertEquals(host.models.documents.route, {
        view: "documents/edit",
        id: "doc-arch-1",
    });
    assertEquals(host.models.documents.stack.length, 1);

    // Switch scope to notebook while on nested route preserves route, query, and stack
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "scope",
            scope: { type: "notebook", notebookId: "nb-system" },
        },
    });
    assertEquals(host.models.documents.scope, {
        type: "notebook",
        notebookId: "nb-system",
    });
    assertEquals(host.models.documents.query, "architecture");
    assertEquals(host.models.documents.route, {
        view: "documents/edit",
        id: "doc-arch-1",
    });
    assertEquals(host.models.documents.stack.length, 1);

    // Switch scope to favorite preserves route, query, and stack
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "scope",
            scope: { type: "favorite" },
        },
    });
    assertEquals(host.models.documents.scope, { type: "favorite" });
    assertEquals(host.models.documents.query, "architecture");
    assertEquals(host.models.documents.route, {
        view: "documents/edit",
        id: "doc-arch-1",
    });

    // Back preserves scope and query
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "back" },
    });
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.stack, []);
    assertEquals(host.models.documents.query, "architecture");
    assertEquals(host.models.documents.scope, { type: "favorite" });

    // Updating query preserves scope
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "query", value: "infrastructure" },
    });
    assertEquals(host.models.documents.query, "infrastructure");
    assertEquals(host.models.documents.scope, { type: "favorite" });

    // Reset scope back to all preserves query
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "scope",
            scope: { type: "all" },
        },
    });
    assertEquals(host.models.documents.scope, { type: "all" });
    assertEquals(host.models.documents.query, "infrastructure");
});

Deno.test("Workspace Host: domain reset silently resets domain route/stack/query/scope without altering host open state", () => {
    // Test 1: domain reset while open for apps
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

    // Test 2: domain reset while open for documents (including scope reset to "all")
    host = workspaceHostReducer(host, {
        type: "open",
        kind: "documents",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "navigate",
            route: { view: "documents/create" },
        },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "query", value: "doc-search" },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "scope", scope: { type: "favorite" } },
    });
    assertEquals(host.open.documents, true);

    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "reset" },
    });
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.stack, []);
    assertEquals(host.models.documents.query, "");
    assertEquals(host.models.documents.scope, { type: "all" });
    assertEquals(host.open.documents, true);

    // Test 3: domain reset while closed stays closed
    let closedHost = initialWorkspaceHost;
    assertEquals(closedHost.open.documents, false);
    closedHost = workspaceHostReducer(closedHost, {
        type: "domain",
        kind: "documents",
        action: { type: "scope", scope: { type: "recent" } },
    });
    closedHost = workspaceHostReducer(closedHost, {
        type: "domain",
        kind: "documents",
        action: { type: "reset" },
    });
    assertEquals(closedHost.open.documents, false);
    assertEquals(closedHost.activeKind, null);
    assertEquals(closedHost.models.documents.route, { view: "documents/root" });
    assertEquals(closedHost.models.documents.scope, { type: "all" });
});

Deno.test("Workspace Host: auth reset clears all domains and resets documents scope to all", () => {
    // Setup both domains open with nested state and custom scopes/queries
    let host = workspaceHostReducer(initialWorkspaceHost, {
        type: "open",
        kind: "apps",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "query", value: "app-q" },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "apps",
        action: { type: "navigate", route: { view: "apps/edit", id: "a1" } },
    });

    host = workspaceHostReducer(host, {
        type: "open",
        kind: "documents",
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: { type: "query", value: "doc-q" },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "scope",
            scope: { type: "notebook", notebookId: "nb-auth" },
        },
    });
    host = workspaceHostReducer(host, {
        type: "domain",
        kind: "documents",
        action: {
            type: "navigate",
            route: { view: "documents/edit", id: "d1" },
        },
    });

    assertEquals(host.open.apps, true);
    assertEquals(host.open.documents, true);
    assertEquals(host.activeKind, "documents");

    // Dispatch auth reset
    host = workspaceHostReducer(host, { type: "reset" });

    // Verify host state is completely reset
    assertEquals(host.open.apps, false);
    assertEquals(host.open.documents, false);
    assertEquals(host.activeKind, null);

    // Verify both models reset to initials, especially documents scope to all
    assertEquals(host.models.apps, initialAppsWorkspaceState);
    assertEquals(host.models.documents, initialDocumentsWorkspaceState);
    assertEquals(host.models.documents.scope, { type: "all" });
});
