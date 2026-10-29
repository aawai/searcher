import { assert, assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EscapeLayerProvider } from "../../components/ui/escape-layer-stack.tsx";
import { WorkspaceSurface } from "./WorkspaceSurface.tsx";

Deno.test("inactive workspace preserves content without taking focus or Escape", async () => {
    const win = new Window();
    const values: Record<string, unknown> = {
        window: win,
        document: win.document,
        HTMLElement: win.HTMLElement,
        Element: win.Element,
        Event: win.Event,
        KeyboardEvent: win.KeyboardEvent,
        innerHeight: 900,
        addEventListener: win.addEventListener.bind(win),
        removeEventListener: win.removeEventListener.bind(win),
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    let nextFrame = 0;
    const frames = new Map<number, FrameRequestCallback>();
    values.requestAnimationFrame = (callback: FrameRequestCallback) => {
        const id = ++nextFrame;
        frames.set(id, callback);
        return id;
    };
    values.cancelAnimationFrame = (id: number) => frames.delete(id);
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries(values)) {
        originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, {
            value,
            configurable: true,
            writable: true,
        });
    }
    const container = win.document.createElement("div");
    const outside = win.document.createElement("button");
    win.document.body.append(outside, container);
    const root = createRoot(container as unknown as Element);
    let closes = 0;
    const render = (active: boolean, routeKey: string) =>
        root.render(
            <EscapeLayerProvider>
                <WorkspaceSurface
                    open
                    active={active}
                    presentation="panel"
                    title="笔记"
                    routeKey={routeKey}
                    nested={false}
                    onBack={() => {}}
                    onClose={() => closes++}
                >
                    <input aria-label="草稿" defaultValue="保留的内容" />
                </WorkspaceSurface>
            </EscapeLayerProvider>,
        );
    const escape = () => {
        win.document.dispatchEvent(
            new win.KeyboardEvent("keydown", {
                key: "Escape",
                bubbles: true,
                cancelable: true,
            }),
        );
    };
    try {
        await act(() => render(true, "first"));
        await act(() => {
            for (const callback of frames.values()) callback(0);
            frames.clear();
        });
        const close = container.querySelector('[aria-label="返回首页"]');
        assert(close);
        assertEquals(win.document.activeElement, close);
        const draft = container.querySelector("input");
        assert(draft);
        draft.value = "编辑后的内容";

        await act(() => render(false, "first"));
        outside.focus();
        await act(() => render(false, "second"));
        assertEquals(win.document.activeElement, outside);
        assertEquals(draft.value, "编辑后的内容");
        assert(container.querySelector("aside")?.hasAttribute("inert"));
        await act(escape);
        assertEquals(closes, 0);
        assertEquals(win.document.activeElement, outside);

        await act(() => render(true, "second"));
        assertEquals(win.document.activeElement, close);
        assertEquals(draft.value, "编辑后的内容");
        await act(escape);
        assertEquals(closes, 1);
    } finally {
        await act(() => root.unmount());
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete (globalThis as Record<string, unknown>)[key];
        }
        win.close();
    }
});
