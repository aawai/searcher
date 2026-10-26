import { assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
    type DockContextValue,
    DockProviderSession,
    useDock,
} from "./DockProvider.tsx";
import type { Envelope, PreferencesDto } from "@shared/contracts.ts";
import { DEFAULT_DOCK_PREFERENCES } from "@shared/dock.ts";

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
                                systemOrder: ["home", "apps", "notes", "ai"],
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
                            systemOrder: ["home", "apps", "notes", "ai"],
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
