import { assertEquals } from "@std/assert";
import type { Location } from "react-router-dom";
import {
    type PendingWindowAction,
    stateForLocation,
    windowForLocation,
    type WindowState,
} from "./window-state.ts";

function at(path: string, key = path): Location {
    const url = new URL(path, "https://searcher.test");
    return {
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        state: null,
        key,
    };
}

const EMPTY: WindowState = { windows: [], activeId: null };

function open(state: WindowState, path: string) {
    return stateForLocation(state, at(path), null);
}

function summary(state: WindowState) {
    return {
        active: state.activeId,
        windows: state.windows.map((window) => [window.id, window.status]),
    };
}

Deno.test("each address shows at most one window", () => {
    for (
        const [path, id] of [
            ["/?view=apps", "apps"],
            ["/?view=notes", "notes"],
            ["/settings/appearance", "settings"],
            ["/account", "settings"],
            ["/trash", "trash"],
            ["/", null],
            ["/?view=unknown", null],
            ["/ask", "ai"],
            ["/ask/abc", "ai"],
            ["/ask/abc/extra", null],
        ] as const
    ) {
        assertEquals(windowForLocation(at(path)), id, path);
    }
});

Deno.test("a window stays visible behind the next one that takes focus", () => {
    const apps = open(EMPTY, "/?view=apps");
    assertEquals(summary(open(apps, "/?view=notes")), {
        active: "notes",
        windows: [["apps", "visible"], ["notes", "visible"]],
    });
});

Deno.test("the desktop minimizes every window without destroying it", () => {
    const state = open(open(EMPTY, "/trash"), "/?view=notes");
    assertEquals(summary(open(state, "/")), {
        active: null,
        windows: [["trash", "minimized"], ["notes", "minimized"]],
    });
});

Deno.test("the AI window is an ordinary window that keeps the others where they are", () => {
    const state = open(open(EMPTY, "/trash"), "/?view=notes");
    const next = open(state, "/ask/abc");
    assertEquals(summary(next), {
        active: "ai",
        windows: [["trash", "visible"], ["notes", "visible"], [
            "ai",
            "visible",
        ]],
    });
    // Switching away leaves it visible behind the next window, still open.
    assertEquals(summary(open(next, "/trash")), {
        active: "trash",
        windows: [["notes", "visible"], ["ai", "visible"], [
            "trash",
            "visible",
        ]],
    });
});

Deno.test("the AI window keeps its own conversation address while another window is active", () => {
    let state = open(EMPTY, "/ask/one");
    state = open(state, "/settings/appearance");
    state = open(state, "/ask/two");
    assertEquals(
        state.windows.find((window) => window.id === "ai")?.location.pathname,
        "/ask/two",
    );
    state = open(state, "/trash");
    assertEquals(
        state.windows.find((window) => window.id === "ai")?.location.pathname,
        "/ask/two",
    );
});

Deno.test("independent pages hide the desktop but keep window state", () => {
    const state = open(EMPTY, "/?view=notes");
    assertEquals(summary(open(state, "/login")), {
        active: null,
        windows: [["notes", "visible"]],
    });
});

Deno.test("a window reopens in most-recently-used order and keeps its own address", () => {
    let state = open(EMPTY, "/settings/search");
    state = open(state, "/trash");
    state = open(state, "/settings/appearance");
    assertEquals(state.windows.map((window) => window.id), [
        "trash",
        "settings",
    ]);
    assertEquals(state.windows[1].location.pathname, "/settings/appearance");
});

Deno.test("a pending minimize or close completes only at its destination", () => {
    const state = open(open(EMPTY, "/trash"), "/?view=notes");
    const action = (kind: PendingWindowAction["kind"]) => ({
        kind,
        id: "notes" as const,
        target: "/trash",
        sourceKey: "notes-key",
    });
    const reached = (
        kind: PendingWindowAction["kind"],
        path: string,
        key: string,
    ) => summary(stateForLocation(state, at(path, key), action(kind)));

    assertEquals(reached("minimize", "/trash", "other"), {
        active: "trash",
        windows: [["notes", "minimized"], ["trash", "visible"]],
    });
    assertEquals(reached("close", "/trash", "other"), {
        active: "trash",
        windows: [["trash", "visible"]],
    });
    // The same entry or a different destination must not complete it.
    assertEquals(reached("close", "/trash", "notes-key").windows.length, 2);
    assertEquals(
        reached("close", "/settings/search", "other").windows.map(([id]) => id),
        ["trash", "notes", "settings"],
    );
});
