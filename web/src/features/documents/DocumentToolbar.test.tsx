import { assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DocumentToolbar } from "./DocumentToolbar.tsx";

function setupDom() {
    const win = new Window();
    const props = [
        "window",
        "document",
        "HTMLElement",
        "HTMLDivElement",
        "HTMLButtonElement",
        "Element",
        "Node",
        "Event",
        "CustomEvent",
        "ResizeObserver",
    ] as const;
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const key of props) {
        originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, {
            value: (win as unknown as Record<string, unknown>)[
                key === "window" ? "self" : key
            ],
            configurable: true,
            writable: true,
        });
    }
    const originalAct =
        (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    return {
        document: win.document,
        restore() {
            for (const [key, desc] of originals) {
                if (desc) {
                    Object.defineProperty(globalThis, key, desc);
                } else {
                    delete (globalThis as Record<string, unknown>)[key];
                }
            }
            if (originalAct !== undefined) {
                (globalThis as Record<string, unknown>)
                    .IS_REACT_ACT_ENVIRONMENT = originalAct;
            } else {
                delete (globalThis as Record<string, unknown>)
                    .IS_REACT_ACT_ENVIRONMENT;
            }
            void win.close();
        },
    };
}

Deno.test("DocumentToolbar: places group dividers between groups, never inside a group", async () => {
    const dom = setupDom();
    try {
        const container = dom.document.createElement("div");
        dom.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);
        await act(() => {
            root.render(
                <DocumentToolbar
                    onCommand={() => {}}
                    onInsertPageBreak={() => {}}
                    onUploadImage={() => {}}
                />,
            );
        });

        const groups = container.querySelectorAll(
            ".document-editor-toolbar-group",
        );
        const dividersInsideGroups = container.querySelectorAll(
            ".document-editor-toolbar-group .document-editor-toolbar-divider",
        );
        const topLevelDividers = container.querySelectorAll(
            ".document-editor-toolbar > .document-editor-toolbar-divider",
        );

        assertEquals(groups.length, 6);
        assertEquals(dividersInsideGroups.length, 0);
        assertEquals(topLevelDividers.length, 5);

        await act(() => {
            root.unmount();
        });
    } finally {
        dom.restore();
    }
});

Deno.test("DocumentToolbar: active command buttons use ghost variant with aria-pressed instead of subtle outline", async () => {
    const dom = setupDom();
    try {
        const container = dom.document.createElement("div");
        dom.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);
        await act(() => {
            root.render(
                <DocumentToolbar
                    onCommand={() => {}}
                    onInsertPageBreak={() => {}}
                    onUploadImage={() => {}}
                    activeCommands={{ bold: true, italic: false }}
                />,
            );
        });

        const boldBtn = container.querySelector(
            'button[aria-label="粗体"]',
        ) as HTMLButtonElement | null;
        assertEquals(boldBtn !== null, true);
        assertEquals(boldBtn?.getAttribute("aria-pressed"), "true");
        assertEquals(boldBtn?.classList.contains("button--ghost"), true);
        assertEquals(boldBtn?.classList.contains("button--subtle"), false);

        await act(() => {
            root.unmount();
        });
    } finally {
        dom.restore();
    }
});
