import { assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
    type DockContextValue,
    DockProviderSession,
    useDock,
} from "./DockProvider.tsx";
import { DOCK_SYSTEM_ITEMS, moveDockItem } from "./DockOrderList.tsx";
import type { Envelope, PreferencesDto } from "@shared/contracts.ts";
import { DEFAULT_DOCK_PREFERENCES } from "@shared/dock.ts";
import { deleteLocal, getLocal, setLocal } from "../../lib/local.ts";
import { setupMockIndexedDB } from "../../lib/test-mock-idb.ts";

function setupDom() {
    const win = new Window();
    const props = [
        "window",
        "document",
        "HTMLElement",
        "HTMLDivElement",
        "Event",
        "CustomEvent",
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
        window: win,
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
        },
    };
}

interface HarnessProps {
    onDock: (dock: DockContextValue) => void;
}

function Harness({ onDock }: HarnessProps) {
    const dock = useDock();
    useEffect(() => {
        onDock(dock);
    });
    return <div id="dock-harness">{dock.preferences.appIds.join(",")}</div>;
}

Deno.test("DockProvider: synchronous consecutive setPinned calls chain without dropping earlier items", async () => {
    const dom = setupDom();
    const originalFetch = globalThis.fetch;

    const sentPatches: Array<{ dock: PreferencesDto["dock"] }> = [];
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "PATCH") {
            const body = JSON.parse(String(init.body)) as {
                dock: PreferencesDto["dock"];
            };
            sentPatches.push(body);
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        status: true,
                        data: { dock: body.dock },
                    } as Envelope<Partial<PreferencesDto>>),
                    {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    },
                ),
            );
        }
        if (url.includes("/api/webapps")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        status: true,
                        data: [],
                    }),
                    {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    },
                ),
            );
        }
        return Promise.resolve(
            new Response(
                JSON.stringify({
                    status: true,
                    data: { dock: { ...DEFAULT_DOCK_PREFERENCES } },
                } as Envelope<Partial<PreferencesDto>>),
                {
                    headers: { "content-type": "application/json" },
                    status: 200,
                },
            ),
        );
    };

    const container = dom.document.createElement("div");
    const root = createRoot(container as unknown as Element);
    let latestDock: DockContextValue | null = null;

    try {
        await act(async () => {
            root.render(
                <DockProviderSession userId="test-user-sync">
                    <Harness
                        onDock={(dock) => {
                            latestDock = dock;
                        }}
                    />
                </DockProviderSession>,
            );
            await Promise.resolve();
        });

        // Trigger two consecutive synchronous setPinned calls and await both completions
        await act(async () => {
            const p1 = latestDock?.setPinned("app-1", true);
            const p2 = latestDock?.setPinned("app-2", true);
            await Promise.all([p1, p2]);
        });

        // 1. Verify actual PATCH payloads recorded in order
        assertEquals(sentPatches.length, 2);
        assertEquals(sentPatches[0].dock.appIds, ["app-1"]);
        assertEquals(sentPatches[1].dock.appIds, ["app-1", "app-2"]);

        // 2. Verify consumer-visible state retains both items
        const dock = latestDock as unknown as DockContextValue;
        assertEquals(dock.preferences.appIds, ["app-1", "app-2"]);

        // 3. Consecutive setSystemVisible calls chain and toggle visibility
        await act(async () => {
            const v1 = latestDock?.setSystemVisible("home", false);
            const v2 = latestDock?.setSystemVisible("ai", false);
            await Promise.all([v1, v2]);
        });
        assertEquals(sentPatches.length, 4);
        assertEquals(sentPatches[2].dock.hiddenSystemIds, ["home"]);
        assertEquals(sentPatches[3].dock.hiddenSystemIds, ["home", "ai"]);
        assertEquals(
            (latestDock as unknown as DockContextValue).preferences
                .hiddenSystemIds,
            ["home", "ai"],
        );

        await act(async () => {
            await latestDock?.setSystemVisible("home", true);
        });
        assertEquals(
            (latestDock as unknown as DockContextValue).preferences
                .hiddenSystemIds,
            ["ai"],
        );
    } finally {
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });
        globalThis.fetch = originalFetch;
        dom.restore();
    }
});

Deno.test("DockProvider: unmount prevents queued second mutation task from sending requests after session unmounted", async () => {
    const dom = setupDom();
    const originalFetch = globalThis.fetch;

    const patchRequests: string[] = [];
    const { promise: firstPatchStarted, resolve: markFirstPatchStarted } =
        Promise.withResolvers<void>();
    const { promise: firstPatchPromise, resolve: resolveFirstPatch } = Promise
        .withResolvers<void>();

    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "PATCH") {
            patchRequests.push(String(init.body));
            markFirstPatchStarted();
            return firstPatchPromise.then(() =>
                new Response(
                    JSON.stringify({
                        status: true,
                        data: { dock: { ...DEFAULT_DOCK_PREFERENCES } },
                    }),
                    {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    },
                )
            );
        }
        if (url.includes("/api/webapps")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        status: true,
                        data: [],
                    }),
                    {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    },
                ),
            );
        }
        return Promise.resolve(
            new Response(
                JSON.stringify({
                    status: true,
                    data: { dock: { ...DEFAULT_DOCK_PREFERENCES } },
                }),
                {
                    headers: { "content-type": "application/json" },
                    status: 200,
                },
            ),
        );
    };

    const container = dom.document.createElement("div");
    const root = createRoot(container as unknown as Element);
    let latestDock: DockContextValue | null = null;

    try {
        await act(async () => {
            root.render(
                <DockProviderSession userId="user-before-unmount">
                    <Harness
                        onDock={(dock) => {
                            latestDock = dock;
                        }}
                    />
                </DockProviderSession>,
            );
            await Promise.resolve();
        });

        // Enqueue first PATCH (starts running and suspends) and second PATCH (queued)
        let p1: Promise<void> | undefined;
        let p2: Promise<void> | undefined;
        act(() => {
            p1 = latestDock?.setPinned("app-1", true);
            p2 = latestDock?.setPinned("app-2", true);
        });

        // Wait until first PATCH is confirmed in flight via handshake
        await firstPatchStarted;

        // Unmount component while first PATCH is in-flight and second PATCH is waiting in queue
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });

        // Resolve first PATCH, allowing queue to proceed
        await act(async () => {
            resolveFirstPatch();
            await Promise.allSettled([p1, p2]);
        });

        // Exactly 1 PATCH was sent (app-1); the second queued PATCH (app-2) MUST NOT be sent!
        assertEquals(patchRequests.length, 1);
        assertEquals(patchRequests[0].includes("app-1"), true);
        assertEquals(patchRequests.some((p) => p.includes("app-2")), false);
    } finally {
        globalThis.fetch = originalFetch;
        dom.restore();
    }
});

Deno.test("DockProvider: refreshApps does not overwrite pending in-flight optimistic mutation", async () => {
    const dom = setupDom();
    const originalFetch = globalThis.fetch;

    const { promise: patchStarted, resolve: markPatchStarted } = Promise
        .withResolvers<void>();
    const { promise: patchPromise, resolve: resolvePatch } = Promise
        .withResolvers<void>();

    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "PATCH") {
            markPatchStarted();
            return patchPromise.then(() =>
                new Response(
                    JSON.stringify({
                        status: true,
                        data: {
                            dock: {
                                systemOrder: [
                                    "home",
                                    "apps",
                                    "notes",
                                    "ai",
                                    "settings",
                                    "trash",
                                ],
                                appIds: ["app-in-flight"],
                            },
                        },
                    }),
                    {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    },
                )
            );
        }
        if (url.includes("/api/webapps")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        status: true,
                        data: [],
                    }),
                    {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    },
                ),
            );
        }
        // GET returns empty dock preferences
        return Promise.resolve(
            new Response(
                JSON.stringify({
                    status: true,
                    data: {
                        dock: {
                            systemOrder: [
                                "home",
                                "apps",
                                "notes",
                                "ai",
                                "settings",
                                "trash",
                            ],
                            appIds: [],
                        },
                    },
                }),
                {
                    headers: { "content-type": "application/json" },
                    status: 200,
                },
            ),
        );
    };

    const container = dom.document.createElement("div");
    const root = createRoot(container as unknown as Element);
    let latestDock: DockContextValue | null = null;

    try {
        await act(async () => {
            root.render(
                <DockProviderSession userId="user-in-flight">
                    <Harness
                        onDock={(dock) => {
                            latestDock = dock;
                        }}
                    />
                </DockProviderSession>,
            );
            await Promise.resolve();
        });

        // Trigger optimistic pin (PATCH stays pending)
        let pinPromise: Promise<void> | undefined;
        act(() => {
            pinPromise = latestDock?.setPinned("app-in-flight", true);
        });

        // Wait until PATCH has actually been initiated
        await patchStarted;

        const dockBefore = latestDock as unknown as DockContextValue;
        assertEquals(dockBefore.preferences.appIds, ["app-in-flight"]);

        // Invoke refreshApps while mutation is in flight; GET returns empty appIds
        await act(async () => {
            await latestDock?.refreshApps();
        });

        const dockAfter = latestDock as unknown as DockContextValue;
        // Server's empty GET result MUST NOT overwrite in-flight optimistic state!
        assertEquals(dockAfter.preferences.appIds, ["app-in-flight"]);

        // Settle pending PATCH
        await act(async () => {
            resolvePatch();
            await pinPromise;
        });
    } finally {
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });
        globalThis.fetch = originalFetch;
        dom.restore();
    }
});

Deno.test("moveDockItem: reorders within bounds without mutating source and returns null out of bounds", () => {
    const source = [
        "home",
        "apps",
        "notes",
        "ai",
        "settings",
        "trash",
    ] as const;
    assertEquals(moveDockItem(source, 0, -1), null);
    assertEquals(moveDockItem(source, 5, 1), null);
    assertEquals(moveDockItem(source, 4, 1), [
        "home",
        "apps",
        "notes",
        "ai",
        "trash",
        "settings",
    ]);
    assertEquals(moveDockItem(source, 1, -1), [
        "apps",
        "home",
        "notes",
        "ai",
        "settings",
        "trash",
    ]);
    assertEquals(source, ["home", "apps", "notes", "ai", "settings", "trash"]);
    assertEquals(Object.keys(DOCK_SYSTEM_ITEMS), [
        "home",
        "apps",
        "notes",
        "ai",
        "settings",
        "trash",
    ]);
});

Deno.test("DockProvider: migrates legacy fixed/collapsible layouts and isolates manual collapse per account", async () => {
    if (
        typeof (globalThis as { indexedDB?: unknown }).indexedDB === "undefined"
    ) {
        setupMockIndexedDB();
    }
    const dom = setupDom();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/webapps")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({ status: true, data: [] }),
                    {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    },
                ),
            );
        }
        return Promise.resolve(
            new Response(
                JSON.stringify({
                    status: true,
                    data: { dock: { ...DEFAULT_DOCK_PREFERENCES } },
                }),
                {
                    headers: { "content-type": "application/json" },
                    status: 200,
                },
            ),
        );
    };

    const fixedKey = "dock_layout:user-legacy-fixed";
    const collapsibleKey = "dock_layout:user-legacy-collapsible";
    const freshKey = "dock_layout:user-fresh";

    await setLocal(fixedKey, {
        edge: "left",
        mode: "fixed",
        collapsed: true,
        ballSide: "right",
        ballY: 0.3,
    });
    await setLocal(collapsibleKey, {
        edge: "right",
        mode: "collapsible",
        collapsed: true,
        ballSide: "right",
        ballY: 0.8,
    });

    const container = dom.document.createElement("div");
    const root = createRoot(container as unknown as Element);
    let latestDock: DockContextValue | null = null;
    const currentDock = (): DockContextValue => {
        if (!latestDock) throw new Error("Dock context was not mounted");
        return latestDock;
    };

    const flushAsync = async () => {
        for (let i = 0; i < 6; i++) {
            await Promise.resolve();
        }
    };

    try {
        // 1. Fresh account starts expanded and can manually collapse at any time
        await act(async () => {
            root.render(
                <DockProviderSession userId="user-fresh">
                    <Harness
                        onDock={(dock) => {
                            latestDock = dock;
                        }}
                    />
                </DockProviderSession>,
            );
            await flushAsync();
        });

        assertEquals(currentDock().layout, {
            edge: "bottom",
            collapsed: false,
            ballSide: "left",
            ballY: 0.5,
        });

        await act(async () => {
            latestDock?.setLayout({ collapsed: true, edge: "top" });
            await flushAsync();
        });

        assertEquals(currentDock().layout, {
            edge: "top",
            collapsed: true,
            ballSide: "left",
            ballY: 0.5,
        });
        assertEquals(await getLocal(freshKey), {
            edge: "top",
            collapsed: true,
            ballSide: "left",
            ballY: 0.5,
        });

        // 2. Legacy fixed account with stale collapsed=true stays expanded
        await act(async () => {
            root.render(
                <DockProviderSession userId="user-legacy-fixed">
                    <Harness
                        onDock={(dock) => {
                            latestDock = dock;
                        }}
                    />
                </DockProviderSession>,
            );
            await flushAsync();
        });

        assertEquals(currentDock().layout, {
            edge: "left",
            collapsed: false,
            ballSide: "right",
            ballY: 0.3,
        });

        // 3. Legacy collapsible account preserves collapsed=true and ball placement
        await act(async () => {
            root.render(
                <DockProviderSession userId="user-legacy-collapsible">
                    <Harness
                        onDock={(dock) => {
                            latestDock = dock;
                        }}
                    />
                </DockProviderSession>,
            );
            await flushAsync();
        });

        assertEquals(currentDock().layout, {
            edge: "right",
            collapsed: true,
            ballSide: "right",
            ballY: 0.8,
        });

        // Verify fresh user's persisted layout remained isolated
        assertEquals(await getLocal(freshKey), {
            edge: "top",
            collapsed: true,
            ballSide: "left",
            ballY: 0.5,
        });
    } finally {
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });
        await deleteLocal(fixedKey);
        await deleteLocal(collapsibleKey);
        await deleteLocal(freshKey);
        globalThis.fetch = originalFetch;
        dom.restore();
    }
});
