import { assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopState } from "./desktop-state.ts";
import {
    type DocumentImmersion,
    useDocumentImmersion,
} from "./useDocumentImmersion.ts";

Deno.test("document immersion rejects other domains and clears on user, host, visibility and entity changes", () => {
    using cleanup = new DisposableStack();
    const window = new Window();
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    const globals: Record<string, unknown> = {
        window,
        document: window.document,
        Element: window.Element,
        HTMLElement: window.HTMLElement,
        getComputedStyle: window.getComputedStyle.bind(window),
        requestAnimationFrame: (callback: FrameRequestCallback) => {
            frames.set(++sequence, callback);
            return sequence;
        },
        cancelAnimationFrame: (id: number) => frames.delete(id),
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [name, value] of Object.entries(globals)) {
        const previous = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, {
            configurable: true,
            writable: true,
            value,
        });
        cleanup.defer(() => {
            if (previous) Object.defineProperty(globalThis, name, previous);
            else Reflect.deleteProperty(globalThis, name);
        });
    }
    const state: DesktopState = {
        activeId: "document:d1",
        windows: [
            {
                id: "document:d1",
                kind: "document",
                entityId: "d1",
                mode: "normal",
                frame: { x: 100, y: 100, width: 600, height: 500 },
                restoreFrame: null,
                zOrder: 2,
            },
            {
                id: "note:n1",
                kind: "note",
                entityId: "n1",
                mode: "normal",
                frame: { x: 120, y: 120, width: 400, height: 300 },
                restoreFrame: null,
                zOrder: 1,
            },
        ],
    };
    let result!: DocumentImmersion;
    function Host(
        props: { state: DesktopState; userId: string; enabled: boolean },
    ) {
        result = useDocumentImmersion(props.state, props.userId, props.enabled);
        return React.createElement("div", { className: "desktop-canvas" });
    }
    const container = window.document.createElement("main");
    window.document.body.append(container);
    const root = createRoot(container as unknown as HTMLElement);
    cleanup.defer(() => act(() => root.unmount()));
    const render = (next: DesktopState, userId = "user-a", enabled = true) => {
        act(() =>
            root.render(
                React.createElement(Host, { state: next, userId, enabled }),
            )
        );
    };
    render(state);
    act(() => result.enter("note:n1"));
    assertEquals(result.immersiveDocumentId, null);
    act(() => result.enter("document:d1"));
    assertEquals(result.immersiveDocumentId, "document:d1");
    render(state, "user-b");
    assertEquals(result.immersiveDocumentId, null);
    assertEquals(
        window.document.documentElement.dataset.documentImmersive,
        undefined,
    );
    render(state);
    act(() => result.enter("document:d1"));
    render(state, "user-a", false);
    assertEquals(result.immersiveDocumentId, null);
    render(state);
    act(() => result.enter("document:d1"));
    render({
        ...state,
        windows: state.windows.map((win) =>
            win.kind === "document" ? { ...win, mode: "minimized" } : win
        ),
    });
    assertEquals(result.immersiveDocumentId, null);
    render(state);
    act(() => result.enter("document:d1"));
    render({
        ...state,
        windows: state.windows.filter((win) => win.kind !== "document"),
    });
    assertEquals(result.immersiveDocumentId, null);
    assertEquals(result.dockShown, false);
});
