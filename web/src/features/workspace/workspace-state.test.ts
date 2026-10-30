import { assertEquals } from "@std/assert";
import { domainWorkspaceReducer, initialDocumentsWorkspaceState } from "./workspace-state.ts";

Deno.test("Workspace navigation replaces the current note and preserves query and scope", () => {
    const initial = { ...initialDocumentsWorkspaceState, query: "work", scope: { type: "favorite" as const } };
    const first = domainWorkspaceReducer(initial, { type: "navigate", route: { view: "documents/edit", id: "one" } });
    const second = domainWorkspaceReducer(first, { type: "navigate", route: { view: "documents/edit", id: "two" } });
    assertEquals(second.route, { view: "documents/edit", id: "two" });
    assertEquals(second.query, "work");
    assertEquals((second as typeof initial).scope, { type: "favorite" });
    assertEquals(domainWorkspaceReducer(second, { type: "navigate", route: { view: "documents/root" } }).route, { view: "documents/root" });
});

Deno.test("Workspace creation replaces only a new route", () => {
    const draft = domainWorkspaceReducer(initialDocumentsWorkspaceState, { type: "navigate", route: { view: "documents/new", target: { notebookId: "nb", isHomeFixed: false } } });
    assertEquals(domainWorkspaceReducer(draft, { type: "created", id: "one" }).route, { view: "documents/edit", id: "one" });
    assertEquals(domainWorkspaceReducer(initialDocumentsWorkspaceState, { type: "created", id: "one" }), initialDocumentsWorkspaceState);
    assertEquals(domainWorkspaceReducer(draft, { type: "reset" }), initialDocumentsWorkspaceState);
});
