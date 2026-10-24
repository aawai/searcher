import { assertEquals } from "@std/assert";
import { deskReducer, type DeskState, initialDeskState } from "./desk-state.ts";

function run(...actions: Parameters<typeof deskReducer>[1][]): DeskState {
    return actions.reduce(deskReducer, initialDeskState);
}

Deno.test("an object opened from 静 returns to 静 when its detail closes", () => {
    const opened = run({
        type: "select",
        selection: { kind: "paper", id: "p1" },
    });
    assertEquals(opened.stage, "overview");
    assertEquals(opened.documents.route, { view: "documents/edit", id: "p1" });
    assertEquals(opened.documents.stack, []);
    const closed = deskReducer(opened, { type: "close" });
    assertEquals([closed.stage, closed.selection], ["calm", null]);
});

Deno.test("a detail opened inside 览 closes back to 览", () => {
    const state = run(
        { type: "enter" },
        { type: "select", selection: { kind: "folder", id: "work" } },
        { type: "close" },
    );
    assertEquals([state.stage, state.selection], ["overview", null]);
});

Deno.test("choosing another object in 览 makes 览 the return point", () => {
    const state = run(
        { type: "select", selection: { kind: "paper", id: "p1" } },
        { type: "select", selection: { kind: "apps" } },
        { type: "close" },
    );
    assertEquals(state.stage, "overview");
});

Deno.test("a note opened from 静 sits over the library; back returns to it", () => {
    const opened = run({
        type: "select",
        selection: { kind: "notes" },
        route: { view: "documents/edit", id: "n1" },
    });
    assertEquals(opened.documents.stack, [{ view: "documents/root" }]);
    const back = deskReducer(opened, {
        type: "documents",
        action: { type: "back" },
    });
    assertEquals(back.documents.route, { view: "documents/root" });
    assertEquals(back.selection, { kind: "notes" });
});

Deno.test("library filters and search survive closing; routes do not", () => {
    const state = run(
        { type: "select", selection: { kind: "notes" } },
        { type: "documents", action: { type: "query", value: "灵感" } },
        {
            type: "documents",
            action: { type: "scope", scope: { type: "favorite" } },
        },
        {
            type: "documents",
            action: {
                type: "navigate",
                route: { view: "documents/edit", id: "n1" },
            },
        },
        { type: "leave" },
    );
    assertEquals(state.stage, "calm");
    assertEquals(state.documents.route, { view: "documents/root" });
    assertEquals(state.documents.stack, []);
    assertEquals(state.documents.query, "灵感");
    assertEquals(state.documents.scope, { type: "favorite" });
});

Deno.test("the mobile list keeps 览 even for an object opened from 静", () => {
    const state = run(
        { type: "select", selection: { kind: "paper", id: "p1" } },
        { type: "list" },
        { type: "close" },
    );
    assertEquals([state.stage, state.selection], ["overview", null]);
});
