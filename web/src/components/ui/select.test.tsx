import { assertEquals, assertExists } from "@std/assert";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";

function setupDom() {
    const win = new Window();
    const props = [
        "window",
        "document",
        "navigator",
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
            win.close();
        },
    };
}

Deno.test("Select renders combobox trigger, opens grouped options, selects value and registers Escape layer", async () => {
    const env = setupDom();
    const {
        Select,
        SelectContent,
        SelectGroup,
        SelectGroupLabel,
        SelectItem,
        SelectTrigger,
        SelectValue,
    } = await import("./select.tsx");
    const { EscapeLayerProvider, useEscapeLayerActive } = await import(
        "./escape-layer-stack.tsx"
    );

    const host = env.document.createElement("div");
    env.document.body.appendChild(host);
    const root = createRoot(host as unknown as Element);

    function Harness() {
        const [value, setValue] = useState<string>("bing");
        const overlayActive = useEscapeLayerActive("overlay");
        const items = { bing: "Bing", google: "Google" };
        return (
            <div data-overlay-active={String(overlayActive)}>
                <Select
                    items={items}
                    value={value}
                    onValueChange={(next) => {
                        if (next !== null) setValue(next);
                    }}
                >
                    <SelectTrigger id="engine-select" aria-label="搜索引擎">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectGroupLabel>常用引擎</SelectGroupLabel>
                            <SelectItem value="bing">Bing</SelectItem>
                            <SelectItem value="google">Google</SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>
        );
    }

    try {
        await act(() => {
            root.render(
                <EscapeLayerProvider>
                    <Harness />
                </EscapeLayerProvider>,
            );
        });

        const wrapper = host.querySelector(
            "[data-overlay-active]",
        ) as unknown as HTMLElement | null;
        const trigger = host.querySelector(
            '[data-slot="select-trigger"]',
        ) as unknown as HTMLElement | null;
        assertExists(wrapper);
        assertExists(trigger);
        assertEquals(trigger.getAttribute("role"), "combobox");
        assertEquals(trigger.getAttribute("id"), "engine-select");
        assertEquals(wrapper.getAttribute("data-overlay-active"), "false");

        assertEquals(trigger.textContent?.trim(), "Bing");

        await act(() => {
            trigger.click();
        });

        assertEquals(wrapper.getAttribute("data-overlay-active"), "true");
        const groupLabel = env.document.body.querySelector(
            '[data-slot="select-group-label"]',
        );
        assertExists(groupLabel);
        assertEquals(groupLabel.textContent, "常用引擎");

        const options = Array.from(
            env.document.body.querySelectorAll('[data-slot="select-item"]'),
        );
        assertEquals(options.length, 2);
        const firstIndicator = options[0].querySelector(".menu-item-indicator");
        const secondIndicator = options[1].querySelector(
            ".menu-item-indicator",
        );
        assertExists(firstIndicator);
        assertExists(secondIndicator);
        assertEquals(options[0].getAttribute("aria-selected"), "true");
        assertEquals(options[0].hasAttribute("data-selected"), true);
        assertEquals(options[1].getAttribute("aria-selected"), "false");
        assertEquals(options[1].hasAttribute("data-selected"), false);

        const googleItem = options[1] as unknown as HTMLElement;
        await act(() => {
            googleItem.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowDown",
                    bubbles: true,
                }),
            );
        });
        await act(() => {
            googleItem.click();
        });

        assertEquals(wrapper.getAttribute("data-overlay-active"), "false");
        assertEquals(trigger.textContent?.trim(), "Google");
    } finally {
        await act(() => {
            root.unmount();
        });
        env.restore();
    }
});
