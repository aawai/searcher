import { assert, assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import {
    NavigationGuardProvider,
    useDestructiveAction,
    useNavigationGuard,
} from "./navigation-guards.tsx";

Deno.test("navigation guards preserve the original destination until every owner approves", async () => {
    const win = new Window();
    const keys = ["window", "document", "HTMLElement", "Event"] as const;
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const key of keys) {
        originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, {
            value: (win as unknown as Record<string, unknown>)[
                key === "window" ? "self" : key
            ],
            configurable: true,
            writable: true,
        });
    }
    const oldAct = (globalThis as Record<string, unknown>)
        .IS_REACT_ACT_ENVIRONMENT;
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

    let additionalGuard = false;
    function Owner({ name }: { name: string }) {
        const [content, setContent] = useState("draft");
        const blocked = useNavigationGuard({
            blocks: ({ nextLocation }) =>
                (nextLocation.pathname === "/ask/2" ||
                    nextLocation.pathname === "/login") &&
                (name !== "third" || additionalGuard),
            warnOnUnload: () => false,
            onCommit: () => setContent("discarded"),
        });
        return (
            <div id={name} data-destination={blocked?.location.pathname}>
                <span id={`${name}-content`}>{content}</span>
                {blocked && (
                    <>
                        <button
                            type="button"
                            id={`${name}-approve`}
                            onClick={blocked.proceed}
                        >
                            approve
                        </button>
                        <button
                            type="button"
                            id={`${name}-cancel`}
                            onClick={blocked.reset}
                        >
                            cancel
                        </button>
                    </>
                )}
            </div>
        );
    }

    function DestructiveAction() {
        const request = useDestructiveAction();
        const [count, setCount] = useState(0);
        return (
            <button
                id="destructive"
                type="button"
                onClick={() => request(() => setCount((value) => value + 1))}
            >
                {count}
            </button>
        );
    }

    const router = createMemoryRouter([{
        path: "*",
        element: (
            <NavigationGuardProvider>
                <Owner name="first" />
                <Owner name="second" />
                <Owner name="third" />
                <DestructiveAction />
            </NavigationGuardProvider>
        ),
    }], { initialEntries: ["/?view=notes"] });
    const container = win.document.createElement("div");
    win.document.body.append(container);
    const root = createRoot(container as unknown as Element);
    const click = async (id: string) => {
        const button = win.document.getElementById(id);
        assert(button, `missing ${id}`);
        await act(async () => {
            (button as unknown as HTMLButtonElement).click();
            await Promise.resolve();
        });
    };
    try {
        await act(() => root.render(<RouterProvider router={router} />));
        await act(async () => {
            await router.navigate("/ask/2");
        });
        assertEquals(router.state.location.search, "?view=notes");
        assertEquals(
            win.document.getElementById("first")?.getAttribute(
                "data-destination",
            ),
            "/ask/2",
        );
        assertEquals(
            win.document.getElementById("second")?.getAttribute(
                "data-destination",
            ),
            null,
        );

        await act(async () => {
            await router.navigate("/trash");
        });
        assertEquals(router.state.location.search, "?view=notes");
        assertEquals(
            win.document.getElementById("first")?.getAttribute(
                "data-destination",
            ),
            "/ask/2",
        );
        await click("first-approve");
        assert(win.document.getElementById("second"));
        assertEquals(
            win.document.getElementById("first-content")?.textContent,
            "draft",
        );
        await click("second-cancel");
        assertEquals(router.state.location.search, "?view=notes");
        assertEquals(
            win.document.getElementById("first-content")?.textContent,
            "draft",
        );
        assertEquals(
            win.document.getElementById("second-content")?.textContent,
            "draft",
        );

        await act(async () => {
            await router.navigate("/ask/2");
        });
        await act(async () => {
            await router.navigate("/trash");
        });
        await click("first-approve");
        await click("second-approve");
        assertEquals(router.state.location.pathname, "/ask/2");
        assertEquals(
            win.document.getElementById("first-content")?.textContent,
            "discarded",
        );
        assertEquals(
            win.document.getElementById("second-content")?.textContent,
            "discarded",
        );

        await act(async () => {
            await router.navigate("/trash");
        });
        assertEquals(router.state.location.pathname, "/trash");

        await act(async () => {
            await router.navigate(-1);
        });
        assertEquals(router.state.location.pathname, "/trash");
        await click("first-approve");
        await click("second-cancel");
        assertEquals(router.state.location.pathname, "/trash");

        await act(async () => {
            await router.navigate(-1);
        });
        await click("first-approve");
        await click("second-approve");
        assertEquals(router.state.location.pathname, "/ask/2");
        await act(async () => {
            await router.navigate(1);
        });
        assertEquals(router.state.location.pathname, "/trash");

        // An owner becoming dangerous after the first approval cannot inherit it.
        await act(async () => {
            await router.navigate(-1);
        });
        await click("first-approve");
        additionalGuard = true;
        await click("second-approve");
        assertEquals(router.state.location.pathname, "/trash");
        assertEquals(
            win.document.getElementById("third-content")?.textContent,
            "draft",
        );

        additionalGuard = false;
        await click("destructive");
        await click("first-approve");
        await click("second-cancel");
        assertEquals(
            win.document.getElementById("destructive")?.textContent,
            "0",
        );
        await click("destructive");
        await act(async () => {
            await router.navigate("/competing");
        });
        assertEquals(router.state.location.pathname, "/trash");
        await click("first-approve");
        await click("second-approve");
        assertEquals(
            win.document.getElementById("destructive")?.textContent,
            "1",
        );
        assertEquals(router.state.location.pathname, "/trash");
    } finally {
        await act(() => root.unmount());
        router.dispose();
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete (globalThis as Record<string, unknown>)[key];
        }
        if (oldAct !== undefined) {
            (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
                oldAct;
        } else {
            delete (globalThis as Record<string, unknown>)
                .IS_REACT_ACT_ENVIRONMENT;
        }
        win.close();
    }
});
