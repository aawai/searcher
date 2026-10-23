import { assertEquals } from "@std/assert";
import {
    initialWorkspaceHost,
    type WorkspaceHostAction,
    workspaceHostReducer,
    type WorkspaceHostState,
} from "./workspace-host.ts";
import { initialDocumentsWorkspaceState } from "./workspace-state.ts";

function run(
    host: WorkspaceHostState,
    ...actions: WorkspaceHostAction[]
): WorkspaceHostState {
    return actions.reduce(workspaceHostReducer, host);
}

const docs = (
    action: Extract<WorkspaceHostAction, { type: "domain" }>["action"],
) => ({
    type: "domain" as const,
    kind: "documents" as const,
    action,
});

Deno.test("Workspace Host: documents retain nested route, query, scope and Back", () => {
    let host = run(
        initialWorkspaceHost,
        { type: "open", kind: "documents" },
        docs({ type: "query", value: "specs" }),
        docs({
            type: "scope",
            scope: { type: "notebook", notebookId: "nb-work" },
        }),
        docs({
            type: "navigate",
            route: { view: "documents/edit", id: "doc-101" },
        }),
    );
    assertEquals(host.open.documents, true);
    assertEquals(host.activeKind, "documents");

    host = run(host, docs({ type: "back" }));
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.query, "specs");
    assertEquals(host.models.documents.scope, {
        type: "notebook",
        notebookId: "nb-work",
    });
    assertEquals(host.models.documents.stack, []);
});

Deno.test("Workspace Host: close and reopen retain root positioning, query and scope", () => {
    let host = run(
        initialWorkspaceHost,
        { type: "open", kind: "documents" },
        docs({ type: "query", value: "quarterly-report" }),
        docs({ type: "scope", scope: { type: "recent" } }),
        docs({
            type: "navigate",
            route: { view: "documents/edit", id: "doc-q3" },
        }),
        { type: "close", kind: "documents" },
    );
    assertEquals(host.open.documents, false);
    assertEquals(host.activeKind, null);
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.query, "quarterly-report");
    assertEquals(host.models.documents.scope, { type: "recent" });

    host = run(host, { type: "open", kind: "documents" });
    assertEquals(host.open.documents, true);
    assertEquals(host.models.documents.route, { view: "documents/root" });
    assertEquals(host.models.documents.query, "quarterly-report");
});

Deno.test("Workspace Host: opening an already-open workspace only activates it", () => {
    const host = run(
        initialWorkspaceHost,
        { type: "open", kind: "documents" },
        docs({
            type: "navigate",
            route: { view: "documents/edit", id: "doc-deep" },
        }),
        { type: "activate", kind: null },
        { type: "open", kind: "documents" },
    );
    assertEquals(host.activeKind, "documents");
    assertEquals(host.models.documents.route, {
        view: "documents/edit",
        id: "doc-deep",
    });
});

Deno.test("Workspace Host: opening a closed workspace normalizes a stale nested route to root", () => {
    const stale: WorkspaceHostState = {
        ...initialWorkspaceHost,
        models: {
            documents: {
                ...initialDocumentsWorkspaceState,
                route: { view: "documents/edit", id: "stale" },
                stack: [{ view: "documents/root" }],
            },
        },
    };
    const reopened = run(stale, { type: "open", kind: "documents" });
    assertEquals(reopened.open.documents, true);
    assertEquals(reopened.models.documents.route, { view: "documents/root" });
    assertEquals(reopened.models.documents.stack, []);
});

Deno.test("Workspace Host: scope and query changes while closed neither open nor activate the host", () => {
    const host = run(
        initialWorkspaceHost,
        docs({ type: "scope", scope: { type: "recent" } }),
        docs({ type: "query", value: "architecture" }),
    );
    assertEquals(host.open.documents, false);
    assertEquals(host.activeKind, null);
    assertEquals(host.models.documents.scope, { type: "recent" });
    assertEquals(host.models.documents.query, "architecture");
});

Deno.test("Workspace Host: domain reset keeps the host open; auth reset closes everything", () => {
    let host = run(
        initialWorkspaceHost,
        { type: "open", kind: "documents" },
        docs({ type: "query", value: "doc-search" }),
        docs({ type: "scope", scope: { type: "favorite" } }),
        docs({ type: "reset" }),
    );
    assertEquals(host.open.documents, true);
    assertEquals(host.models.documents, initialDocumentsWorkspaceState);

    host = run(
        host,
        docs({ type: "query", value: "again" }),
        { type: "reset" },
    );
    assertEquals(host.open.documents, false);
    assertEquals(host.activeKind, null);
    assertEquals(host.models.documents, initialDocumentsWorkspaceState);
});
