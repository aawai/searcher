import { assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";

function setupDom() {
    const win = new Window();
    const props = [
        "window",
        "document",
        "navigator",
        "open",
        "HTMLElement",
        "SVGElement",
        "HTMLDivElement",
        "HTMLButtonElement",
        "DocumentFragment",
        "Element",
        "Node",
        "Event",
        "CustomEvent",
        "MouseEvent",
        "KeyboardEvent",
        "PointerEvent",
        "getComputedStyle",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "ResizeObserver",
        "MutationObserver",
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

Deno.test("ConflictDialog: deduplicates copy-draft action and keeps 4 footer actions", async () => {
    const dom = setupDom();
    try {
        const { ConflictDialog } = await import("./ConflictDialog.tsx");
        const { EscapeLayerProvider } = await import(
            "../ui/escape-layer-stack.tsx"
        );
        const { Textarea } = await import("../ui/textarea.tsx");
        const container = dom.document.createElement("div");
        dom.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);
        await act(async () => {
            root.render(
                <EscapeLayerProvider>
                    <ConflictDialog
                        open
                        serverVersion={{
                            title: "云端",
                            body: "server",
                            version: 2,
                        }}
                        localTitle="本地"
                        localBody="local"
                        onResolve={async () => {}}
                        onDismiss={() => {}}
                        mergeContent={
                            <Textarea
                                id="conflict-merge-input"
                                placeholder="编辑合并后的正文"
                                value="local"
                                onChange={() => {}}
                            />
                        }
                        onMerge={async () => {}}
                    />
                </EscapeLayerProvider>,
            );
            await new Promise((r) => setTimeout(r, 20));
        });

        const footerButtons = Array.from(
            dom.document.querySelectorAll(".conflict-actions button"),
        ).map((el) => el.textContent?.trim());

        assertEquals(footerButtons, [
            "暂不处理",
            "用云端版本",
            "用我的版本",
            "另存副本",
        ]);
        assertEquals(
            dom.document.body.textContent?.includes("复制草稿"),
            false,
        );
        assertEquals(
            dom.document.body.textContent?.includes("编辑合并内容后保存"),
            true,
        );

        await act(() => {
            root.unmount();
        });
    } finally {
        dom.restore();
    }
});

Deno.test("ModelSelector: marks the selected model with radio menuitem state when opened", async () => {
    const dom = setupDom();
    try {
        const { ModelSelector } = await import("./ModelSelector.tsx");
        const { EscapeLayerProvider } = await import(
            "../ui/escape-layer-stack.tsx"
        );
        const container = dom.document.createElement("div");
        dom.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);
        await act(() => {
            root.render(
                <EscapeLayerProvider>
                    <ModelSelector
                        models={[
                            {
                                id: "m1",
                                label: "Model One",
                                provider: "Provider A",
                            },
                            {
                                id: "m2",
                                label: "Model Two",
                                provider: "Provider B",
                            },
                        ]}
                        selected="m2"
                        onChange={() => {}}
                    />
                </EscapeLayerProvider>,
            );
        });

        const trigger = dom.document.querySelector(
            ".model-trigger",
        ) as HTMLButtonElement | null;
        assertEquals(trigger !== null, true);

        await act(async () => {
            trigger?.dispatchEvent(
                new globalThis.MouseEvent("click", { bubbles: true }),
            );
            await new Promise((r) => setTimeout(r, 20));
        });

        const radioItems = Array.from(
            dom.document.querySelectorAll('[role="menuitemradio"]'),
        );
        assertEquals(radioItems.length, 2);
        assertEquals(
            radioItems[0].getAttribute("aria-checked"),
            "false",
        );
        assertEquals(
            radioItems[1].getAttribute("aria-checked"),
            "true",
        );

        await act(() => {
            root.unmount();
        });
    } finally {
        dom.restore();
    }
});

Deno.test("EngineSelector: differentiates reachability failure beyond color and exposes tooltip metadata", async () => {
    const dom = setupDom();
    try {
        const { EngineSelector } = await import("./EngineSelector.tsx");
        const { EscapeLayerProvider } = await import(
            "../ui/escape-layer-stack.tsx"
        );
        const container = dom.document.createElement("div");
        dom.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);
        await act(() => {
            root.render(
                <EscapeLayerProvider>
                    <EngineSelector
                        engine="bing"
                        onEngineChange={() => {}}
                        reachability={{
                            google: {
                                ok: false,
                                checkedAt: 1700000000000,
                                latency: 500,
                            },
                            bing: {
                                ok: true,
                                checkedAt: 1700000000000,
                                latency: 42,
                            },
                        }}
                    />
                </EscapeLayerProvider>,
            );
        });

        const trigger = dom.document.querySelector(
            ".search-engine",
        ) as HTMLButtonElement | null;
        await act(async () => {
            trigger?.dispatchEvent(
                new globalThis.MouseEvent("click", { bubbles: true }),
            );
            await new Promise((r) => setTimeout(r, 20));
        });

        // Failed status uses a distinct non-dot error indicator (svg icon), while online keeps status-dot.
        const failedIndicator = dom.document.querySelector(
            ".engine-status--failed",
        );
        const onlineIndicator = dom.document.querySelector(
            ".engine-status--online .status-dot.online",
        );
        assertEquals(failedIndicator !== null, true);
        assertEquals(onlineIndicator !== null, true);
        assertEquals(
            failedIndicator?.querySelector("svg") !== null,
            true,
        );

        await act(() => {
            root.unmount();
        });
    } finally {
        dom.restore();
    }
});

Deno.test("BotanicalSceneChoices: renders 6 specimen SVG tiles, reflects selection, and notifies hover preview", async () => {
    const dom = setupDom();
    try {
        const { BotanicalSceneChoices } = await import(
            "./BotanicalSceneChoices.tsx"
        );
        const container = dom.document.createElement("div");
        dom.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);
        const selectedCalls: string[] = [];
        const previewCalls: Array<string | null> = [];

        await act(() => {
            root.render(
                <BotanicalSceneChoices
                    value="maple"
                    onValueChange={(next) => selectedCalls.push(next)}
                    onPreviewSpecies={(sp) => previewCalls.push(sp)}
                    testId="botanical-choices-test"
                    itemTestIdPrefix="botanical-tile"
                />,
            );
        });

        const tiles = Array.from(
            dom.document.querySelectorAll(".botanical-choice"),
        );
        assertEquals(tiles.length, 6);
        assertEquals(
            tiles.every(
                (t) => t.querySelector("svg.botanical-choice-glyph") !== null,
            ),
            true,
        );
        const captions = tiles.map((t) =>
            t.querySelector(".botanical-choice-caption")?.textContent?.trim()
        );
        assertEquals(captions, [
            "每日",
            "银杏",
            "红枫",
            "尤加利",
            "寒梅",
            "蕨类",
        ]);

        const mapleTile = dom.document.querySelector(
            '[data-testid="botanical-tile-maple"]',
        ) as HTMLElement | null;
        const plumTile = dom.document.querySelector(
            '[data-testid="botanical-tile-plum"]',
        ) as HTMLElement | null;
        assertEquals(mapleTile?.hasAttribute("data-checked"), true);
        assertEquals(plumTile?.hasAttribute("data-checked"), false);

        await act(() => {
            plumTile?.dispatchEvent(
                new globalThis.MouseEvent("mouseover", { bubbles: true }),
            );
            plumTile?.dispatchEvent(
                new globalThis.MouseEvent("click", { bubbles: true }),
            );
            plumTile?.dispatchEvent(
                new globalThis.MouseEvent("mouseout", { bubbles: true }),
            );
        });

        assertEquals(selectedCalls, ["plum"]);
        assertEquals(previewCalls.includes("plum"), true);

        await act(() => {
            root.unmount();
        });
    } finally {
        dom.restore();
    }
});
