import { assert, assertEquals } from "@std/assert";
import { chromium, type Locator, type Page } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

interface FrameBox {
    x: number;
    y: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

interface DragGeometry {
    viewport: { width: number; height: number };
    frame: FrameBox;
    title: FrameBox;
    chrome: FrameBox;
    bounds: { left: number; right: number; top: number; bottom: number };
}

const traceSetup = () => {
    type TraceEntry = Record<string, unknown>;
    const browserWindow = globalThis as typeof globalThis & {
        __desktopDragTrace?: TraceEntry[];
        __desktopDragPhase?: string;
        __desktopDragSnapshot?: (label: string) => TraceEntry;
    };
    const trace: TraceEntry[] = [];
    let phase = "idle";
    let activePointerId: number | null = null;
    let pointerMoveCount = 0;
    const previousGeometry = new Map<string, Record<string, string>>();
    browserWindow.__desktopDragTrace = trace;
    browserWindow.__desktopDragPhase = phase;
    const rect = (element: Element | null) => {
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        const round = (value: number) => Math.round(value * 100) / 100;
        return {
            x: round(bounds.x),
            y: round(bounds.y),
            left: round(bounds.left),
            top: round(bounds.top),
            right: round(bounds.right),
            bottom: round(bounds.bottom),
            width: round(bounds.width),
            height: round(bounds.height),
        };
    };
    const describe = (element: Element | null) =>
        element
            ? {
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                className: typeof element.className === "string"
                    ? element.className
                    : null,
                windowId:
                    element.closest<HTMLElement>(".desktop-window")?.dataset
                        .windowId ?? null,
            }
            : null;
    const geometry = (windowRoot?: HTMLElement | null) => {
        const headers = Array.from(
            document.querySelectorAll(".topbar, .connection-banner"),
        ).filter((element) => {
            const style = getComputedStyle(element);
            const bounds = element.getBoundingClientRect();
            return style.display !== "none" && bounds.width > 0 &&
                bounds.height > 0;
        });
        const dock = document.querySelector<HTMLElement>(".desktop-dock");
        return {
            viewport: { width: innerWidth, height: innerHeight },
            headers: headers.map((element) => rect(element)),
            canvas: rect(document.querySelector(".desktop-canvas")),
            dock: dock && getComputedStyle(dock).display !== "none"
                ? rect(dock)
                : null,
            frame: rect(
                windowRoot ??
                    document.querySelector(
                        '.desktop-window[data-window-id="apps"]',
                    ),
            ),
        };
    };
    const snapshot = (label: string, event?: PointerEvent) => {
        const target = event?.target instanceof Element ? event.target : null;
        const root = target?.closest<HTMLElement>(".desktop-window") ??
            document.querySelector<HTMLElement>(
                '.desktop-window[data-window-id="apps"]',
            );
        const title = root?.querySelector(
            ".desktop-window-chrome-title",
        ) ?? null;
        const candidates = root
            ? [root, ...Array.from(root.querySelectorAll("*"))]
            : [];
        const captureOwners = event
            ? candidates.filter((element) => {
                try {
                    return element.hasPointerCapture(event.pointerId);
                } catch {
                    return false;
                }
            }).map(describe)
            : [];
        const activeWindow = document.querySelector<HTMLElement>(
            '.desktop-window[data-window-active="true"]',
        );
        const preview = document.querySelector<HTMLElement>(
            "[data-snap-preview]",
        );
        const currentGeometry = geometry(root);
        const nextGeometry = Object.fromEntries(
            Object.entries(currentGeometry).map(([key, value]) => [
                key,
                JSON.stringify(value),
            ]),
        );
        const windowId = root?.dataset.windowId ?? "apps";
        const previous = previousGeometry.get(windowId);
        const geometryReasons = previous
            ? Object.entries(nextGeometry).flatMap(([key, value]) =>
                previous[key] !== value
                    ? [`${key} changed since previous pointer sample`]
                    : []
            )
            : [];
        previousGeometry.set(windowId, nextGeometry);
        const entry: TraceEntry = {
            kind: "snapshot",
            windowId,
            label,
            phase,
            event: event
                ? {
                    type: event.type,
                    pointerId: event.pointerId,
                    pointerType: event.pointerType,
                    isPrimary: event.isPrimary,
                    target: describe(
                        event.target instanceof Element ? event.target : null,
                    ),
                    hasPointerCapture: captureOwners.length > 0,
                    captureOwners,
                }
                : null,
            geometryReason: event ? "sampled after actual pointer event" : null,
            geometryReasons,
            geometry: currentGeometry,
            activeIdFromRenderedReducerState: activeWindow?.dataset.windowId ??
                null,
            activeFlags: root
                ? Array.from(
                    document.querySelectorAll<HTMLElement>(
                        ".desktop-window[data-window-active]",
                    ),
                ).map((element) => ({
                    windowId: element.dataset.windowId,
                    active: element.dataset.windowActive,
                }))
                : [],
            snapPreview: preview
                ? {
                    mode: preview.dataset.snapMode ?? null,
                    bounds: rect(preview),
                }
                : null,
            documentActiveElement: describe(
                document.activeElement instanceof Element
                    ? document.activeElement
                    : null,
            ),
            title: rect(title),
        };
        trace.push(entry);
        browserWindow.__desktopDragPhase = phase;
        return entry;
    };
    browserWindow.__desktopDragSnapshot = (label) => snapshot(label);

    const pointerEvents = [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "gotpointercapture",
        "lostpointercapture",
    ];
    for (const type of pointerEvents) {
        globalThis.document.addEventListener(type, (rawEvent) => {
            const event = rawEvent as PointerEvent;
            const target = event.target instanceof Element
                ? event.target
                : null;
            const onDesktopWindow = !!target?.closest(".desktop-window");
            if (type === "pointerdown" && onDesktopWindow) {
                activePointerId = event.pointerId;
                pointerMoveCount = 0;
                phase = "pointerdown";
            } else if (event.pointerId === activePointerId) {
                phase = type === "pointermove" ? "pointermove" : type;
                if (type === "pointermove") pointerMoveCount++;
            }
            if (onDesktopWindow || event.pointerId === activePointerId) {
                snapshot(type, event);
            }
        }, true);
    }
    globalThis.addEventListener("resize", () => {
        trace.push({
            kind: "geometry-event",
            reason: "window resize event",
            phase,
            geometry: geometry(),
        });
    });

    const objectStorePrototype = IDBObjectStore.prototype;
    for (const method of ["put", "add", "delete", "clear"] as const) {
        const original = objectStorePrototype[method];
        Object.defineProperty(objectStorePrototype, method, {
            configurable: true,
            writable: true,
            value: function (this: IDBObjectStore, ...args: unknown[]) {
                let key: unknown = method === "delete" ? args[0] : args[1];
                if (typeof key !== "string") {
                    const value = args[0];
                    if (value && typeof value === "object" && "key" in value) {
                        key = value.key;
                    }
                }
                if (
                    this.transaction.db.name === "searcher-client" &&
                    this.name === "state" &&
                    typeof key === "string" &&
                    key.startsWith("searcher:desktop-layout:v1:")
                ) {
                    trace.push({
                        kind: "indexeddb-layout-write",
                        method,
                        key,
                        phase,
                        pointerMoveCount,
                    });
                }
                return (original as unknown as (
                    ...values: unknown[]
                ) => unknown)
                    .apply(this, args);
            },
        });
    }
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init) => {
        const rawUrl = input instanceof Request
            ? input.url
            : input instanceof URL
            ? input.href
            : input;
        const method = (
            init?.method ??
                (input instanceof Request ? input.method : "GET")
        ).toUpperCase();
        const path = new URL(rawUrl, globalThis.location.href).pathname;
        if (
            path.startsWith("/api/") &&
            ["POST", "PUT", "PATCH", "DELETE"].includes(method)
        ) {
            trace.push({
                kind: "api-write",
                method,
                path,
                phase,
                pointerMoveCount,
            });
        }
        return nativeFetch(input, init);
    };
};

async function nextAnimationFrame(page: Page) {
    await page.evaluate(() =>
        new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
        })
    );
}

async function dragGeometry(
    page: Page,
    windowLocator?: Locator,
): Promise<DragGeometry> {
    const root = windowLocator ?? page.locator(
        '.desktop-window[data-window-id="apps"]',
    );
    return await root.evaluate((root) => {
        const box = (element: Element | null): FrameBox => {
            if (!element) throw new Error("Expected desktop drag geometry");
            const rect = element.getBoundingClientRect();
            return {
                x: rect.x,
                y: rect.y,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
            };
        };
        const title = root.querySelector(".desktop-window-chrome-title");
        const chrome = root.querySelector(".desktop-window-chrome");
        if (!title || !chrome) throw new Error("Window chrome is unavailable");
        const visibleHeaders = Array.from(
            document.querySelectorAll(".topbar, .connection-banner"),
        ).filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && rect.width > 0 &&
                rect.height > 0 && rect.bottom > 0;
        });
        const headerBottom = Math.max(
            0,
            ...visibleHeaders.map((element) =>
                element.getBoundingClientRect().bottom
            ),
        );
        const dock = document.querySelector<HTMLElement>(".desktop-dock");
        const dockRect = dock?.getBoundingClientRect();
        const dockTop = dock && dockRect &&
                getComputedStyle(dock).display !== "none" &&
                dockRect.width > 0 && dockRect.height > 0
            ? dockRect.top
            : innerHeight;
        const frame = box(root);
        return {
            viewport: { width: innerWidth, height: innerHeight },
            frame,
            title: box(title),
            chrome: box(chrome),
            bounds: {
                left: 0,
                right: innerWidth - frame.width,
                top: headerBottom,
                bottom: Math.min(
                    innerHeight - frame.height,
                    dockTop - box(chrome).height,
                ),
            },
        };
    });
}

async function readPersistedLayout(page: Page) {
    return await page.evaluate(async () => {
        const auth = (await (await fetch("/api/auth/me")).json()).data;
        if (!auth?.user?.id) return null;
        const key = `searcher:desktop-layout:v1:${auth.user.id}`;
        return await new Promise<
            {
                activeId: string | null;
                window: {
                    frame: {
                        x: number;
                        y: number;
                        width: number;
                        height: number;
                    };
                    mode: string;
                } | null;
            } | null
        >((resolve, reject) => {
            const open = indexedDB.open("searcher-client", 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains("state")) {
                    db.close();
                    resolve(null);
                    return;
                }
                const read = db.transaction("state", "readonly")
                    .objectStore("state").get(key);
                read.onerror = () => {
                    db.close();
                    reject(read.error);
                };
                read.onsuccess = () => {
                    const saved = read.result as {
                        activeId?: string | null;
                        windows?: Array<{
                            id: string;
                            frame: {
                                x: number;
                                y: number;
                                width: number;
                                height: number;
                            };
                            mode: string;
                        }>;
                    } | undefined;
                    const window = saved?.windows?.find((item) =>
                        item.id === "apps"
                    );
                    db.close();
                    resolve(
                        saved
                            ? {
                                activeId: saved.activeId ?? null,
                                window: window
                                    ? { frame: window.frame, mode: window.mode }
                                    : null,
                            }
                            : null,
                    );
                };
            };
        });
    });
}
async function waitForPersistedAppsFrame(page: Page, expected: FrameBox) {
    await page.waitForFunction(
        async (frame) => {
            const auth = (await (await fetch("/api/auth/me")).json()).data;
            if (!auth?.user?.id) return false;
            const key = `searcher:desktop-layout:v1:${auth.user.id}`;
            return await new Promise<boolean>((resolve, reject) => {
                const open = indexedDB.open("searcher-client", 1);
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result;
                    if (!db.objectStoreNames.contains("state")) {
                        db.close();
                        resolve(false);
                        return;
                    }
                    const read = db.transaction("state", "readonly")
                        .objectStore("state").get(key);
                    read.onerror = () => {
                        db.close();
                        reject(read.error);
                    };
                    read.onsuccess = () => {
                        const layout = read.result as {
                            activeId?: string | null;
                            windows?: Array<{
                                id: string;
                                mode: string;
                                frame: {
                                    x: number;
                                    y: number;
                                    width: number;
                                    height: number;
                                };
                            }>;
                        } | undefined;
                        const saved = layout?.windows?.find((item) =>
                            item.id === "apps"
                        );
                        const matches = layout?.activeId === "apps" &&
                            saved?.mode === "normal" &&
                            !!saved.frame &&
                            Math.abs(saved.frame.x * innerWidth - frame.x) <=
                                1 &&
                            Math.abs(saved.frame.y * innerHeight - frame.y) <=
                                1 &&
                            Math.abs(
                                    saved.frame.width * innerWidth -
                                        frame.width,
                                ) <=
                                1 &&
                            Math.abs(
                                    saved.frame.height * innerHeight -
                                        frame.height,
                                ) <= 1;
                        db.close();
                        resolve(matches);
                    };
                };
            });
        },
        expected,
        { timeout: 2500 },
    );
}

async function clearPersistedLayout(page: Page) {
    await page.evaluate(async () => {
        const auth = (await (await fetch("/api/auth/me")).json()).data;
        if (!auth?.user?.id) return;
        await new Promise<void>((resolve, reject) => {
            const open = indexedDB.open("searcher-client", 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains("state")) {
                    db.close();
                    resolve();
                    return;
                }
                const tx = db.transaction("state", "readwrite");
                tx.objectStore("state").delete(
                    `searcher:desktop-layout:v1:${auth.user.id}`,
                );
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            };
        });
    });
}

async function activeWindowId(page: Page) {
    return await page.locator(
        '.desktop-window[data-window-active="true"]',
    ).getAttribute("data-window-id");
}
async function recordedWindowPointerId(
    page: Page,
    windowId: string,
): Promise<number | null> {
    return await page.evaluate((windowId) => {
        const browserWindow = globalThis as typeof globalThis & {
            __desktopDragTrace?: Array<Record<string, unknown>>;
        };
        const down = [...(browserWindow.__desktopDragTrace ?? [])].reverse()
            .find((entry) =>
                entry.kind === "snapshot" &&
                entry.label === "pointerdown" &&
                entry.windowId === windowId
            );
        const event = down?.event;
        if (!event || typeof event !== "object" || !("pointerId" in event)) {
            return null;
        }
        return typeof event.pointerId === "number" ? event.pointerId : null;
    }, windowId);
}

async function recordedAppsPointerId(page: Page): Promise<number | null> {
    return await recordedWindowPointerId(page, "apps");
}
async function dragWindowByTwenty(
    page: Page,
    window: Locator,
    expectedKind: string,
) {
    const windowId = await window.getAttribute("data-window-id");
    const windowKind = await window.getAttribute("data-window-kind");
    assert(windowId, "Desktop window needs an id");
    assertEquals(windowKind, expectedKind);
    const before = await window.boundingBox();
    const title = await window.locator(".desktop-window-chrome-title")
        .boundingBox();
    assert(before && title, `${expectedKind} window geometry must be visible`);
    const pointer = {
        x: title.x + title.width / 2,
        y: title.y + title.height / 2,
    };
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down();
    await page.mouse.move(pointer.x + 20, pointer.y, { steps: 4 });
    await nextAnimationFrame(page);
    await page.mouse.up();
    await nextAnimationFrame(page);
    const after = await window.boundingBox();
    assert(
        after && Math.abs(after.x - before.x - 20) <= 1,
        `${expectedKind} window should follow a normal 20px drag: before=${
            JSON.stringify(before)
        } after=${JSON.stringify(after)}`,
    );
    assertEquals(await window.getAttribute("data-window-active"), "true");
    assertEquals(await activeWindowId(page), windowId);

    const edgeStart = await dragGeometry(page, window);
    const edgePointer = {
        x: edgeStart.title.x + edgeStart.title.width / 2,
        y: edgeStart.title.y + edgeStart.title.height / 2,
    };
    const boundaryPointer = edgeStart.bounds.right +
        (edgePointer.x - edgeStart.frame.x);
    const overshoot = Math.min(
        50,
        Math.floor(edgeStart.viewport.width - 2 - boundaryPointer),
    );
    assertEquals(
        overshoot,
        50,
        `${expectedKind} window must have 50px right-edge overshoot room`,
    );
    const edgeTargetX = boundaryPointer + overshoot;
    assert(
        edgeTargetX < edgeStart.viewport.width - 32,
        `${expectedKind} right-edge gesture must stay outside the Snap zone`,
    );
    await page.mouse.move(edgePointer.x, edgePointer.y);
    await page.mouse.down();
    await page.mouse.move(edgeTargetX, edgePointer.y);
    await nextAnimationFrame(page);
    const pointerId = await recordedWindowPointerId(page, windowId);
    assert(
        pointerId !== null,
        `${expectedKind} drag pointer id was not traced`,
    );
    const atEdge = await dragGeometry(page, window);
    const captureAtEdge = await window.evaluate(
        (root, pointerId) =>
            [root, ...Array.from(root.querySelectorAll("*"))].some(
                (element) => {
                    try {
                        return element.hasPointerCapture(pointerId);
                    } catch {
                        return false;
                    }
                },
            ),
        pointerId,
    );
    await page.mouse.move(edgeTargetX - 5, edgePointer.y);
    await nextAnimationFrame(page);
    const afterReverse = await dragGeometry(page, window);
    await page.mouse.up();
    await nextAnimationFrame(page);
    const captureAfterRelease = await window.evaluate(
        (root, pointerId) =>
            ![root, ...Array.from(root.querySelectorAll("*"))].some(
                (element) => {
                    try {
                        return element.hasPointerCapture(pointerId);
                    } catch {
                        return false;
                    }
                },
            ),
        pointerId,
    );
    assert(
        captureAtEdge && captureAfterRelease &&
            Math.abs(atEdge.frame.x - edgeStart.bounds.right) <= 1 &&
            Math.abs(afterReverse.frame.x - edgeStart.bounds.right + 5) <= 1 &&
            Math.abs(afterReverse.frame.y - edgeStart.frame.y) <= 1,
        `${expectedKind} window should reverse 5px immediately after right-edge overshoot: ${
            JSON.stringify({
                edgeStart,
                atEdge,
                afterReverse,
                captureAtEdge,
                captureAfterRelease,
            })
        }`,
    );
    assertEquals(await activeWindowId(page), windowId);
}

Deno.test("desktop drag preserves immediate reverse movement at all normal bounds", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "desktop_drag_157",
        password: "Desktop-drag-157!",
        displayName: "Desktop drag regression",
    });
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
    });
    const page = await context.newPage();
    await page.addInitScript(traceSetup);
    await loginAndVisit(page, app.origin, "/", credentials);
    await page.evaluate(async () => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: "widgets" }),
        });
        if (!response.ok) throw new Error(await response.text());
    });
    await page.reload();
    await page.locator(".home-widgets").waitFor({ state: "visible" });

    const apiWrites: Array<{ method: string; path: string }> = [];
    page.on("request", (request) => {
        const method = request.method();
        const path = new URL(request.url()).pathname;
        if (
            path.startsWith("/api/") &&
            ["POST", "PUT", "PATCH", "DELETE"].includes(method)
        ) {
            apiWrites.push({ method, path });
        }
    });

    const appsDock = page.locator(
        '.desktop-dock button[aria-label="应用工作区"]',
    );
    const appsWindow = page.locator(
        '.desktop-window[data-window-id="apps"]',
    );
    async function openApps() {
        await appsDock.waitFor({ state: "visible" });
        await appsDock.click();
        await appsWindow.waitFor({ state: "visible" });
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="apps"][data-window-active="true"]',
            ) !== null
        );
    }
    async function currentTrace() {
        return await page.evaluate(() => {
            const browserWindow = globalThis as typeof globalThis & {
                __desktopDragTrace?: Array<Record<string, unknown>>;
            };
            return browserWindow.__desktopDragTrace ?? [];
        });
    }
    async function mark(label: string) {
        return await page.evaluate((label) => {
            const browserWindow = globalThis as typeof globalThis & {
                __desktopDragSnapshot?: (
                    label: string,
                ) => Record<string, unknown>;
            };
            return browserWindow.__desktopDragSnapshot?.(label) ?? null;
        }, label);
    }
    async function resetWindow() {
        await page.goto(app.origin + "/settings");
        await page.locator("main").waitFor();
        await clearPersistedLayout(page);
        await page.goto(app.origin + "/");
        await page.locator(".home-widgets").waitFor({ state: "visible" });
        await openApps();
    }

    const problems: string[] = [];
    const diagnosis: Array<Record<string, unknown>> = [];
    const edgeNames = ["left", "right", "top", "bottom"] as const;
    await openApps();

    for (
        const size of [
            { width: 1440, height: 900 },
            { width: 1024, height: 768 },
        ]
    ) {
        if (page.viewportSize()?.width !== size.width) {
            await page.setViewportSize(size);
            await page.waitForFunction(
                ({ width, height }) =>
                    innerWidth === width && innerHeight === height,
                size,
            );
        }
        for (const edge of edgeNames) {
            if (
                await appsWindow.count() === 0 || !await appsWindow.isVisible()
            ) {
                await openApps();
            }
            const geometry = await dragGeometry(page);
            const start = {
                x: geometry.title.x + geometry.title.width / 2,
                y: geometry.title.bottom - 1,
            };
            const axis = edge === "left" || edge === "right" ? "x" : "y";
            const outward = edge === "left" || edge === "top" ? -1 : 1;
            const bound = edge === "left"
                ? geometry.bounds.left
                : edge === "right"
                ? geometry.bounds.right
                : edge === "top"
                ? geometry.bounds.top
                : geometry.bounds.bottom;
            const pointerOffset = axis === "x"
                ? start.x - geometry.frame.x
                : start.y - geometry.frame.y;
            const boundaryPointer = bound + pointerOffset;
            const availableOvershoot = edge === "left"
                ? boundaryPointer - 2
                : edge === "right"
                ? geometry.viewport.width - 2 - boundaryPointer
                : edge === "top"
                ? boundaryPointer - 2
                : geometry.viewport.height - 2 - boundaryPointer;
            const overshoot = Math.min(50, Math.floor(availableOvershoot));
            if (overshoot < 50) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: only ${overshoot}px in-viewport overshoot is available`,
                );
            }
            const safeOvershoot = Math.max(0, overshoot);
            const target = axis === "x"
                ? { x: boundaryPointer + outward * safeOvershoot, y: start.y }
                : { x: start.x, y: boundaryPointer + outward * safeOvershoot };
            const activeBefore = await activeWindowId(page);
            await waitForPersistedAppsFrame(page, geometry.frame);
            const apiStart = apiWrites.length;
            const traceStart = (await currentTrace()).length;
            await mark(`${size.width}x${size.height} ${edge}: ready`);
            await page.mouse.move(start.x, start.y);
            await page.mouse.down();
            await nextAnimationFrame(page);
            const pointerId = await recordedAppsPointerId(page);
            await waitForPersistedAppsFrame(page, geometry.frame);
            const traceAfterFocus = await currentTrace();
            const apiAfterFocus = apiWrites.length;
            await page.mouse.move(target.x, target.y);
            const atOvershoot = await dragGeometry(page);
            const captureAfterOvershoot = pointerId === null
                ? false
                : await appsWindow.evaluate((root, pointerId) => {
                    return [root, ...Array.from(root.querySelectorAll("*"))]
                        .some((element) => {
                            try {
                                return element.hasPointerCapture(pointerId);
                            } catch {
                                return false;
                            }
                        });
                }, pointerId);
            const activeAfterOvershoot = await activeWindowId(page);
            const preview = await page.locator("[data-snap-preview]").count();
            const expectedAxisBound = bound;
            const overshootAxis = axis === "x"
                ? atOvershoot.frame.x
                : atOvershoot.frame.y;
            const axisReverse = async (pixels: number) => {
                const point = axis === "x"
                    ? { x: target.x - outward * pixels, y: target.y }
                    : { x: target.x, y: target.y - outward * pixels };
                await page.mouse.move(point.x, point.y);
                await nextAnimationFrame(page);
                const current = await dragGeometry(page);
                return {
                    frame: current.frame,
                    pointer: point,
                };
            };
            const reverse5 = await axisReverse(5);
            const reverse5Axis = axis === "x"
                ? reverse5.frame.x
                : reverse5.frame.y;
            const expectedReverse5 = expectedAxisBound - outward * 5;
            const backToEdge = await axisReverse(0);
            const backToEdgeAxis = axis === "x"
                ? backToEdge.frame.x
                : backToEdge.frame.y;
            const reverse10 = await axisReverse(10);
            const reverse10Axis = axis === "x"
                ? reverse10.frame.x
                : reverse10.frame.y;
            const expectedReverse10 = expectedAxisBound - outward * 10;
            const returnToEdge = await axisReverse(0);
            const returnToEdgeAxis = axis === "x"
                ? returnToEdge.frame.x
                : returnToEdge.frame.y;
            const repeatedCollisionAxes: number[] = [];
            for (let repeat = 0; repeat < 3; repeat++) {
                await axisReverse(5);
                const collided = await axisReverse(0);
                repeatedCollisionAxes.push(
                    axis === "x" ? collided.frame.x : collided.frame.y,
                );
            }
            const outsidePoint = {
                x: target.x,
                y: Math.max(33, geometry.bounds.top - 20),
            };
            await page.mouse.move(outsidePoint.x, outsidePoint.y);
            await nextAnimationFrame(page);
            const outsideState = await page.evaluate(({ x, y, pointerId }) => {
                const element = document.elementFromPoint(x, y);
                const windowElement = element?.closest<HTMLElement>(
                    ".desktop-window",
                );
                const root = document.querySelector<HTMLElement>(
                    '.desktop-window[data-window-id="apps"]',
                );
                const active = document.querySelector<HTMLElement>(
                    '.desktop-window[data-window-active="true"]',
                );
                const captureOwners = root && pointerId !== null
                    ? [root, ...Array.from(root.querySelectorAll("*"))].filter(
                        (candidate) => {
                            try {
                                return candidate.hasPointerCapture(pointerId);
                            } catch {
                                return false;
                            }
                        },
                    ).length
                    : 0;
                return {
                    point: { x, y },
                    underPointerWindowId: windowElement?.dataset.windowId ??
                        null,
                    underTitle: !!element?.closest(
                        ".desktop-window-chrome-title",
                    ),
                    captureOwners,
                    activeId: active?.dataset.windowId ?? null,
                    frame: root
                        ? (() => {
                            const rect = root.getBoundingClientRect();
                            return {
                                x: rect.x,
                                y: rect.y,
                                right: rect.right,
                                bottom: rect.bottom,
                                width: rect.width,
                                height: rect.height,
                            };
                        })()
                        : null,
                };
            }, { ...outsidePoint, pointerId });
            await mark(`${size.width}x${size.height} ${edge}: outside window`);
            const normalReleasePoint = {
                x: geometry.viewport.width / 2,
                y: Math.min(geometry.bounds.top + 100, size.height - 2),
            };
            await page.mouse.move(
                normalReleasePoint.x,
                normalReleasePoint.y,
            );
            await nextAnimationFrame(page);
            const previewAtReleasePoint = await page.locator(
                "[data-snap-preview]",
            ).count();
            const apiBeforeRelease = apiWrites.length;
            await page.mouse.up();
            await nextAnimationFrame(page);
            const releasedCapture = pointerId === null
                ? false
                : await appsWindow.evaluate((root, pointerId) => {
                    return ![root, ...Array.from(root.querySelectorAll("*"))]
                        .some((element) => {
                            try {
                                return element.hasPointerCapture(pointerId);
                            } catch {
                                return false;
                            }
                        });
                }, pointerId);
            const releasedActiveId = await activeWindowId(page);
            const releasedGeometry = await dragGeometry(page);
            let persisted = await readPersistedLayout(page);
            try {
                await waitForPersistedAppsFrame(page, releasedGeometry.frame);
                persisted = await readPersistedLayout(page);
            } catch {
                problems.push(
                    `${size.width}x${size.height} ${edge}: released DOM frame did not settle to the persisted reducer frame`,
                );
            }
            const trace = await currentTrace();
            const layoutWrites = trace.filter((entry) =>
                entry.kind === "indexeddb-layout-write"
            );
            const focusTrace = trace.slice(traceStart, traceAfterFocus.length);
            const initialFocusWrites = focusTrace.filter((entry) =>
                entry.kind === "indexeddb-layout-write"
            );
            const initialFocusApiWrites = focusTrace.filter((entry) =>
                entry.kind === "api-write"
            );
            const gestureWrites = trace.slice(traceAfterFocus.length).filter(
                (entry) =>
                    entry.kind === "indexeddb-layout-write" &&
                    entry.phase === "pointermove",
            );
            const gestureApiWrites = trace.slice(traceAfterFocus.length).filter(
                (entry) =>
                    entry.kind === "api-write" &&
                    entry.phase === "pointermove",
            );
            const apiWritesDuringGesture = apiWrites.slice(
                apiAfterFocus,
                apiBeforeRelease,
            );
            const releaseLayoutWrites = layoutWrites.filter((entry) =>
                entry.phase === "pointerup"
            );
            const frameInBounds = (frame: FrameBox) =>
                frame.x >= -1 && frame.y >= geometry.bounds.top - 1 &&
                frame.right <= geometry.viewport.width + 1 &&
                frame.bottom <= geometry.viewport.height + 1 &&
                frame.y <= geometry.bounds.bottom + 1;
            const titleVisible = (frame: FrameBox, title: FrameBox) =>
                title.x >= -1 && title.y >= -1 &&
                title.right <= geometry.viewport.width + 1 &&
                title.bottom <= geometry.viewport.height + 1 &&
                title.y >= -1 && frame.height > 0;
            if (Math.abs(overshootAxis - expectedAxisBound) > 1) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: frame did not reach the expected normal bound ${expectedAxisBound}`,
                );
            }
            if (Math.abs(reverse5Axis - expectedReverse5) > 1) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: reverse 5px expected ${expectedReverse5}, got ${reverse5Axis}`,
                );
            }
            if (Math.abs(backToEdgeAxis - expectedAxisBound) > 1) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: outward return after reverse 5px drifted to ${backToEdgeAxis}`,
                );
            }
            if (Math.abs(reverse10Axis - expectedReverse10) > 1) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: reverse 10px expected ${expectedReverse10}, got ${reverse10Axis}`,
                );
            }
            if (Math.abs(returnToEdgeAxis - expectedAxisBound) > 1) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: outward return after reverse 10px drifted to ${returnToEdgeAxis}`,
                );
            }
            if (
                repeatedCollisionAxes.some((value) =>
                    Math.abs(value - expectedAxisBound) > 1
                )
            ) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: repeated collisions accumulated frame drift`,
                );
            }
            if (
                !frameInBounds(atOvershoot.frame) ||
                !frameInBounds(reverse5.frame) ||
                !frameInBounds(reverse10.frame) ||
                !frameInBounds(releasedGeometry.frame) ||
                !titleVisible(atOvershoot.frame, atOvershoot.title)
            ) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: a drag frame or titlebar escaped normal viewport bounds`,
                );
            }
            if (
                !captureAfterOvershoot || outsideState.captureOwners === 0 ||
                !releasedCapture
            ) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: pointer capture was not retained through overshoot/outside-window movement and released on pointerup`,
                );
            }
            if (
                activeAfterOvershoot !== activeBefore ||
                outsideState.activeId !== activeBefore ||
                releasedActiveId !== activeBefore
            ) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: rendered reducer activeId changed during drag (${activeBefore} → ${activeAfterOvershoot}/${outsideState.activeId}/${releasedActiveId})`,
                );
            }
            if (
                outsideState.point.x < 0 ||
                outsideState.point.y < 0 ||
                outsideState.point.x >= size.width ||
                outsideState.point.y >= size.height ||
                outsideState.underPointerWindowId !== null ||
                outsideState.underTitle
            ) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: held pointer did not leave the window while remaining in the viewport`,
                );
            }
            if (edge === "top" ? preview === 0 : preview > 0) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: unexpected Snap preview state at normal-bound overshoot`,
                );
            }
            if (previewAtReleasePoint > 0) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: Snap preview remained after moving the held pointer back into the normal release zone`,
                );
            }
            if (gestureWrites.length > 0) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: IndexedDB desktop-layout write occurred during pointermove`,
                );
            }
            if (
                gestureApiWrites.length > 0 ||
                apiWritesDuringGesture.length > 0
            ) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: API write occurred after initial FOCUS and before release (${
                        JSON.stringify({
                            observedFetchWrites: gestureApiWrites,
                            observedRequests: apiWritesDuringGesture,
                        })
                    })`,
                );
            }
            if (
                !persisted?.window ||
                persisted.activeId !== releasedActiveId ||
                persisted.window.mode !== "normal"
            ) {
                problems.push(
                    `${size.width}x${size.height} ${edge}: release did not persist a normal Apps frame and activeId`,
                );
            }
            diagnosis.push({
                viewport: size,
                edge,
                pointerId,
                overshoot,
                boundaryPointer,
                expectedAxisBound,
                frames: {
                    before: geometry.frame,
                    overshoot: atOvershoot.frame,
                    reverse5: reverse5.frame,
                    returnAfter5: backToEdge.frame,
                    reverse10: reverse10.frame,
                    returnAfter10: returnToEdge.frame,
                    repeatedCollisionAxes,
                    outside: outsideState.frame,
                    release: releasedGeometry.frame,
                    persisted,
                },
                state: {
                    captureAfterOvershoot,
                    releasedCapture,
                    activeBefore,
                    activeAfterOvershoot,
                    activeOutsideWindow: outsideState.activeId,
                    activeAfterRelease: releasedActiveId,
                    outsideState,
                    snapPreviewCount: preview,
                    snapPreviewAtReleasePoint: previewAtReleasePoint,
                    initialFocusIndexedDbWrites: initialFocusWrites,
                    initialFocusApiFetchWrites: initialFocusApiWrites,
                    initialFocusApiRequests: apiWrites.slice(
                        apiStart,
                        apiAfterFocus,
                    ),
                    indexedDbWritesAfterInitialFocus: gestureWrites,
                    apiFetchWritesAfterFocusBeforeRelease: gestureApiWrites,
                    apiRequestsAfterFocusBeforeRelease: apiWritesDuringGesture,
                    releaseIndexedDbWrites: releaseLayoutWrites,
                    releaseApiRequests: apiWrites.slice(apiBeforeRelease),
                },
                trace: trace.slice(traceStart),
            });
            if (
                size.width !== 1024 || edge !== "bottom"
            ) {
                await resetWindow();
            }
        }
    }

    assertEquals(
        diagnosis.length,
        8,
        "M0 diagnosis must complete all four edges at both desktop sizes",
    );
    if (problems.length > 0) {
        assert(
            false,
            `Desktop drag regression(s):\n- ${
                problems.join("\n- ")
            }\nActual pointer/capture/geometry/focus trace by viewport and edge:\n${
                JSON.stringify(diagnosis, null, 2)
            }`,
        );
    }
    await resetWindow();
    let thresholdGeometry = await dragGeometry(page);
    let thresholdStart = {
        x: thresholdGeometry.title.x + thresholdGeometry.title.width / 2,
        y: thresholdGeometry.title.y + thresholdGeometry.title.height / 2,
    };
    await page.mouse.move(thresholdStart.x, thresholdStart.y);
    await page.mouse.down();
    await page.mouse.move(thresholdStart.x + 3, thresholdStart.y);
    await nextAnimationFrame(page);
    await page.mouse.up();
    await nextAnimationFrame(page);
    let clickFrame = await dragGeometry(page);
    assert(
        Math.abs(clickFrame.frame.x - thresholdGeometry.frame.x) <= 1 &&
            Math.abs(clickFrame.frame.y - thresholdGeometry.frame.y) <= 1,
        "A titlebar movement below the 4px activation threshold must stay a click",
    );

    thresholdGeometry = await dragGeometry(page);
    thresholdStart = {
        x: thresholdGeometry.title.x + thresholdGeometry.title.width / 2,
        y: thresholdGeometry.title.y + thresholdGeometry.title.height / 2,
    };
    await page.mouse.move(thresholdStart.x, thresholdStart.y);
    await page.mouse.down();
    await page.mouse.move(thresholdStart.x + 4, thresholdStart.y);
    await nextAnimationFrame(page);
    clickFrame = await dragGeometry(page);
    await page.mouse.up();
    await nextAnimationFrame(page);
    assert(
        Math.abs(clickFrame.frame.x - thresholdGeometry.frame.x - 4) <= 1,
        "The first movement at the 4px threshold must retain its exact delta",
    );

    const mismatchedTypes = [
        "pointermove",
        "pointerup",
        "pointercancel",
        "lostpointercapture",
    ] as const;
    const mismatchProblems: string[] = [];
    const mismatchDiagnosis: Array<Record<string, unknown>> = [];
    for (const type of mismatchedTypes) {
        await resetWindow();
        const mismatchTraceStart = (await currentTrace()).length;
        const beforeGeometry = await dragGeometry(page);
        const start = {
            x: beforeGeometry.title.x + beforeGeometry.title.width / 2,
            y: beforeGeometry.title.y + beforeGeometry.title.height / 2,
        };
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 24, start.y);
        await nextAnimationFrame(page);
        const realPointerId = await recordedAppsPointerId(page);
        assert(
            realPointerId !== null,
            `${type}: real pointer id was not traced`,
        );
        const pointerId = realPointerId + 100;
        const frameBeforeMismatch = await dragGeometry(page);
        const captureBeforeMismatch = await appsWindow.evaluate(
            (root, pointerId) =>
                [root, ...Array.from(root.querySelectorAll("*"))].some(
                    (element) => {
                        try {
                            return element.hasPointerCapture(pointerId);
                        } catch {
                            return false;
                        }
                    },
                ),
            realPointerId,
        );
        await mark(`pointerId mismatch ${type}: before`);
        await appsWindow.locator(".desktop-window-chrome").evaluate(
            (chrome, spec) => {
                chrome.dispatchEvent(
                    new PointerEvent(spec.type, {
                        bubbles: true,
                        cancelable: true,
                        pointerId: spec.pointerId,
                        pointerType: "mouse",
                        isPrimary: true,
                        button: -1,
                        buttons: 1,
                        clientX: 0,
                        clientY: 0,
                    }),
                );
            },
            { type, pointerId },
        );
        await nextAnimationFrame(page);
        const frameAfterMismatch = await dragGeometry(page);
        const captureAfterMismatch = await appsWindow.evaluate(
            (root, pointerId) =>
                [root, ...Array.from(root.querySelectorAll("*"))].some(
                    (element) => {
                        try {
                            return element.hasPointerCapture(pointerId);
                        } catch {
                            return false;
                        }
                    },
                ),
            realPointerId,
        );
        const activeAfterMismatch = await activeWindowId(page);
        await mark(`pointerId mismatch ${type}: after`);
        await page.mouse.move(start.x + 29, start.y);
        await nextAnimationFrame(page);
        const frameAfterRealMove = await dragGeometry(page);
        await page.mouse.up();
        await nextAnimationFrame(page);
        const captureAfterRelease = await appsWindow.evaluate(
            (root, pointerId) =>
                ![root, ...Array.from(root.querySelectorAll("*"))].some(
                    (element) => {
                        try {
                            return element.hasPointerCapture(pointerId);
                        } catch {
                            return false;
                        }
                    },
                ),
            realPointerId,
        );
        const activeAfterRelease = await activeWindowId(page);
        const trace = await currentTrace();
        if (
            !captureBeforeMismatch || !captureAfterMismatch ||
            !captureAfterRelease
        ) {
            mismatchProblems.push(
                `${type}: mismatched pointerId changed real pointer capture`,
            );
        }
        if (
            Math.abs(frameAfterMismatch.frame.x - frameBeforeMismatch.frame.x) >
                1 ||
            Math.abs(frameAfterMismatch.frame.y - frameBeforeMismatch.frame.y) >
                1
        ) {
            mismatchProblems.push(
                `${type}: mismatched pointerId changed the real drag frame`,
            );
        }
        if (
            Math.abs(
                    frameAfterRealMove.frame.x -
                        frameBeforeMismatch.frame.x - 5,
                ) > 1 ||
            Math.abs(frameAfterRealMove.frame.y - frameBeforeMismatch.frame.y) >
                1
        ) {
            mismatchProblems.push(
                `${type}: the matching real pointer stopped moving after a mismatched event`,
            );
        }
        if (
            activeAfterMismatch !== "apps" || activeAfterRelease !== "apps"
        ) {
            mismatchProblems.push(
                `${type}: activeId changed after a mismatched pointer event`,
            );
        }
        mismatchDiagnosis.push({
            eventType: type,
            realPointerId,
            injectedPointerId: pointerId,
            frameBeforeMismatch: frameBeforeMismatch.frame,
            frameAfterMismatch: frameAfterMismatch.frame,
            frameAfterMatchingMove: frameAfterRealMove.frame,
            captureBeforeMismatch,
            captureAfterMismatch,
            captureAfterRelease,
            activeAfterMismatch,
            activeAfterRelease,
            trace: trace.slice(mismatchTraceStart),
        });
    }
    if (mismatchProblems.length > 0) {
        assert(
            false,
            `Mismatched pointer events must not terminate or drive the active drag:\n- ${
                mismatchProblems.join("\n- ")
            }\n${JSON.stringify(mismatchDiagnosis, null, 2)}`,
        );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() =>
        innerWidth === 1440 && innerHeight === 900
    );
    const geometryChangeDiagnosis: Array<Record<string, unknown>> = [];
    for (
        const change of [
            { name: "Header", selector: ".topbar" },
            { name: "Dock", selector: ".desktop-dock" },
        ]
    ) {
        await resetWindow();
        const geometryTraceStart = (await currentTrace()).length;
        const beforeGeometry = await dragGeometry(page);
        const start = {
            x: beforeGeometry.title.x + beforeGeometry.title.width / 2,
            y: beforeGeometry.title.y + beforeGeometry.title.height / 2,
        };
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 24, start.y);
        await nextAnimationFrame(page);
        const pointerId = await recordedAppsPointerId(page);
        assert(
            pointerId !== null,
            `${change.name}: real pointer id was not traced`,
        );
        const frameBeforeChange = await dragGeometry(page);
        const captureBeforeChange = await appsWindow.evaluate(
            (root, pointerId) =>
                [root, ...Array.from(root.querySelectorAll("*"))].some(
                    (element) => {
                        try {
                            return element.hasPointerCapture(pointerId);
                        } catch {
                            return false;
                        }
                    },
                ),
            pointerId,
        );
        const element = page.locator(change.selector);
        const originalHeight = await element.evaluate((node) =>
            node.getBoundingClientRect().height
        );
        const changedHeight = change.name === "Header"
            ? originalHeight + 12
            : await element.evaluate((node, geometry) => {
                const rect = node.getBoundingClientRect();
                const targetTop = geometry.bounds.bottom +
                    geometry.chrome.height - 20;
                return rect.bottom - targetTop;
            }, beforeGeometry);
        await mark(`${change.name} geometry change: before`);
        await element.evaluate((node, height) => {
            (node as HTMLElement).style.setProperty(
                "height",
                `${height}px`,
                "important",
            );
        }, changedHeight);
        await page.waitForFunction(
            ({ pointerId, selector, height }) => {
                const changedElement = document.querySelector<HTMLElement>(
                    selector,
                );
                const root = document.querySelector<HTMLElement>(
                    '.desktop-window[data-window-id="apps"]',
                );
                if (!changedElement || !root) return false;
                const captureOwners = [
                    root,
                    ...Array.from(root.querySelectorAll("*")),
                ].some((candidate) => {
                    try {
                        return candidate.hasPointerCapture(pointerId);
                    } catch {
                        return false;
                    }
                });
                return !captureOwners &&
                    Math.abs(
                            changedElement.getBoundingClientRect().height -
                                height,
                        ) <= 1;
            },
            {
                pointerId,
                selector: change.selector,
                height: changedHeight,
            },
        );
        await page.mouse.move(
            beforeGeometry.viewport.width - 2,
            Math.max(0, beforeGeometry.bounds.top - 10),
        );
        await nextAnimationFrame(page);
        await page.waitForFunction((pointerId) => {
            const browserWindow = globalThis as typeof globalThis & {
                __desktopDragTrace?: Array<Record<string, unknown>>;
            };
            return (browserWindow.__desktopDragTrace ?? []).some((entry) => {
                if (
                    entry.kind !== "snapshot" ||
                    entry.label !== "lostpointercapture" ||
                    !entry.event || typeof entry.event !== "object" ||
                    !("pointerId" in entry.event)
                ) return false;
                return entry.event.pointerId === pointerId;
            });
        }, pointerId);
        const changedGeometry = await dragGeometry(page);
        const geometryDelta = change.name === "Header"
            ? changedGeometry.bounds.top - frameBeforeChange.bounds.top
            : frameBeforeChange.bounds.bottom - changedGeometry.bounds.bottom;
        const captureAfterChange = await appsWindow.evaluate(
            (root, pointerId) =>
                ![root, ...Array.from(root.querySelectorAll("*"))].some(
                    (element) => {
                        try {
                            return element.hasPointerCapture(pointerId);
                        } catch {
                            return false;
                        }
                    },
                ),
            pointerId,
        );
        await page.mouse.move(start.x + 29, start.y);
        await nextAnimationFrame(page);
        const frameAfterMatchingMove = await dragGeometry(page);
        const activeAfterChange = await activeWindowId(page);
        await page.mouse.up();
        await nextAnimationFrame(page);
        const releasedGeometry = await dragGeometry(page);
        let persisted = await readPersistedLayout(page);
        try {
            await waitForPersistedAppsFrame(page, releasedGeometry.frame);
            persisted = await readPersistedLayout(page);
        } catch {
            geometryChangeDiagnosis.push({
                name: change.name,
                issue:
                    `${change.name} geometry cancellation did not settle to persisted layout`,
            });
        }
        const trace = await currentTrace();
        if (geometryDelta < 8) {
            geometryChangeDiagnosis.push({
                name: change.name,
                issue:
                    `${change.name} did not change its effective normal drag bound`,
                geometryDelta,
            });
        }
        if (!captureBeforeChange || !captureAfterChange) {
            geometryChangeDiagnosis.push({
                name: change.name,
                issue:
                    `${change.name} geometry change did not safely release pointer capture`,
                captureBeforeChange,
                captureAfterChange,
            });
        }
        if (
            Math.abs(
                    frameAfterMatchingMove.frame.x - changedGeometry.frame.x,
                ) > 1 ||
            Math.abs(
                    frameAfterMatchingMove.frame.y - changedGeometry.frame.y,
                ) > 1
        ) {
            geometryChangeDiagnosis.push({
                name: change.name,
                issue:
                    `${change.name} geometry change left the prior drag active`,
                changed: changedGeometry.frame,
                afterMatchingMove: frameAfterMatchingMove.frame,
            });
        }
        const viewport = releasedGeometry.viewport;
        if (
            activeAfterChange !== "apps" ||
            persisted?.activeId !== "apps" ||
            !persisted.window ||
            persisted.window.mode !== "normal" ||
            Math.abs(
                    persisted.window.frame.x * viewport.width -
                        releasedGeometry.frame.x,
                ) > 1 ||
            Math.abs(
                    persisted.window.frame.y * viewport.height -
                        releasedGeometry.frame.y,
                ) > 1 ||
            Math.abs(
                    persisted.window.frame.width * viewport.width -
                        releasedGeometry.frame.width,
                ) > 1 ||
            Math.abs(
                    persisted.window.frame.height * viewport.height -
                        releasedGeometry.frame.height,
                ) > 1
        ) {
            geometryChangeDiagnosis.push({
                name: change.name,
                issue:
                    `${change.name} geometry cancellation lost active Apps or left DOM/reducer state inconsistent`,
                activeAfterChange,
                released: releasedGeometry.frame,
                persisted,
            });
        }
        geometryChangeDiagnosis.push({
            name: change.name,
            pointerId,
            geometryDelta,
            frameBeforeChange: frameBeforeChange.frame,
            frameAfterChange: changedGeometry.frame,
            frameAfterMatchingMove: frameAfterMatchingMove.frame,
            released: releasedGeometry.frame,
            persisted,
            captureBeforeChange,
            captureAfterChange,
            activeAfterChange,
            trace: trace.slice(geometryTraceStart),
        });
        await element.evaluate((node) => {
            (node as HTMLElement).style.removeProperty("height");
        });
        await nextAnimationFrame(page);
    }
    if (geometryChangeDiagnosis.some((entry) => "issue" in entry)) {
        assert(
            false,
            `Actual Header/Dock geometry changes must end drag safely and preserve layout:\n${
                JSON.stringify(geometryChangeDiagnosis, null, 2)
            }`,
        );
    }
    await resetWindow();
    const gapGeometryBefore = await dragGeometry(page);
    const gapStart = {
        x: gapGeometryBefore.title.x + gapGeometryBefore.title.width / 2,
        y: gapGeometryBefore.title.y + gapGeometryBefore.title.height / 2,
    };
    const safeRectTraceStart = (await currentTrace()).length;
    await page.mouse.move(gapStart.x, gapStart.y);
    await page.mouse.down();
    await page.mouse.move(gapStart.x + 24, gapStart.y);
    await nextAnimationFrame(page);
    const gapPointerId = await recordedAppsPointerId(page);
    assert(
        gapPointerId !== null,
        "SafeRect change: real pointer id was not traced",
    );
    const safeRectProblems: string[] = [];
    const frameBeforeGap = await dragGeometry(page);
    const captureBeforeGap = await appsWindow.evaluate(
        (root, pointerId) =>
            [root, ...Array.from(root.querySelectorAll("*"))].some(
                (element) => {
                    try {
                        return element.hasPointerCapture(pointerId);
                    } catch {
                        return false;
                    }
                },
            ),
        gapPointerId,
    );
    if (!captureBeforeGap) {
        safeRectProblems.push(
            "SafeRect change started without real pointer capture",
        );
    }
    const gapBefore = await page.evaluate(() =>
        Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
                "--space-window-gap",
            ),
        )
    );
    await mark("SafeRect-only change: before");
    await page.evaluate((gap) => {
        document.documentElement.style.setProperty(
            "--space-window-gap",
            `${gap + 4}px`,
        );
        document.body.classList.add("desktop-drag-safe-rect-probe");
    }, gapBefore);
    await nextAnimationFrame(page);
    await nextAnimationFrame(page);
    const gapAfter = await page.evaluate(() =>
        Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
                "--space-window-gap",
            ),
        )
    );
    if (Math.abs(gapAfter - gapBefore - 4) > 0.1) {
        safeRectProblems.push("SafeRect-only gap did not change by 4px");
    }
    const frameAfterGap = await dragGeometry(page);
    const captureAfterGap = await appsWindow.evaluate(
        (root, pointerId) =>
            [root, ...Array.from(root.querySelectorAll("*"))].some(
                (element) => {
                    try {
                        return element.hasPointerCapture(pointerId);
                    } catch {
                        return false;
                    }
                },
            ),
        gapPointerId,
    );
    await page.mouse.move(gapStart.x + 29, gapStart.y);
    await nextAnimationFrame(page);
    const frameAfterGapMove = await dragGeometry(page);
    const activeAfterGap = await activeWindowId(page);
    const safeRectTraceBeforeRelease = (await currentTrace()).slice(
        safeRectTraceStart,
    );
    const lostCaptureAfterGap = safeRectTraceBeforeRelease.some((entry) =>
        entry.kind === "snapshot" &&
        entry.label === "lostpointercapture" &&
        !!entry.event && typeof entry.event === "object" &&
        "pointerId" in entry.event &&
        entry.event.pointerId === gapPointerId
    );
    await page.mouse.up();
    await nextAnimationFrame(page);
    const releasedAfterGap = await dragGeometry(page);
    let persistedAfterGap = await readPersistedLayout(page);
    try {
        await waitForPersistedAppsFrame(page, releasedAfterGap.frame);
        persistedAfterGap = await readPersistedLayout(page);
    } catch {
        safeRectProblems.push(
            "SafeRect change did not settle to persisted layout",
        );
    }
    const safeRectTrace = (await currentTrace()).slice(safeRectTraceStart);
    if (!captureAfterGap || lostCaptureAfterGap) {
        safeRectProblems.push(
            "SafeRect-only change canceled the active pointer capture",
        );
    }
    if (
        Math.abs(frameAfterGap.frame.x - frameBeforeGap.frame.x) > 1 ||
        Math.abs(frameAfterGap.frame.y - frameBeforeGap.frame.y) > 1 ||
        Math.abs(frameAfterGapMove.frame.x - frameBeforeGap.frame.x - 5) > 1 ||
        Math.abs(frameAfterGapMove.frame.y - frameBeforeGap.frame.y) > 1
    ) {
        safeRectProblems.push("SafeRect-only change moved or stopped the drag");
    }
    if (
        activeAfterGap !== "apps" ||
        persistedAfterGap?.activeId !== "apps" ||
        !persistedAfterGap.window ||
        persistedAfterGap.window.mode !== "normal" ||
        Math.abs(
                persistedAfterGap.window.frame.x *
                        releasedAfterGap.viewport.width -
                    releasedAfterGap.frame.x,
            ) > 1 ||
        Math.abs(
                persistedAfterGap.window.frame.y *
                        releasedAfterGap.viewport.height -
                    releasedAfterGap.frame.y,
            ) > 1 ||
        Math.abs(
                persistedAfterGap.window.frame.width *
                        releasedAfterGap.viewport.width -
                    releasedAfterGap.frame.width,
            ) > 1 ||
        Math.abs(
                persistedAfterGap.window.frame.height *
                        releasedAfterGap.viewport.height -
                    releasedAfterGap.frame.height,
            ) > 1
    ) {
        safeRectProblems.push(
            "SafeRect-only change lost active Apps or left DOM/reducer state inconsistent",
        );
    }
    await page.evaluate(() => {
        document.documentElement.style.removeProperty("--space-window-gap");
        document.body.classList.remove("desktop-drag-safe-rect-probe");
    });
    await nextAnimationFrame(page);
    if (safeRectProblems.length > 0) {
        assert(
            false,
            `SafeRect-only geometry change must not interrupt drag:\n${
                safeRectProblems.join("\n")
            }\n${
                JSON.stringify(
                    {
                        gapBefore,
                        gapAfter,
                        frameBeforeGap,
                        frameAfterGap,
                        frameAfterGapMove,
                        releasedAfterGap,
                        persistedAfterGap,
                        captureBeforeGap,
                        captureAfterGap,
                        lostCaptureAfterGap,
                        activeAfterGap,
                        trace: safeRectTrace,
                    },
                    null,
                    2,
                )
            }`,
        );
    }
    await resetWindow();
    const entityIds = await page.evaluate(async () => {
        const noteResponse = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Desktop drag note",
                body: "Real API note fixture for desktop window drag.",
                isPinned: false,
                isHomeFixed: false,
            }),
        });
        if (!noteResponse.ok) throw new Error(await noteResponse.text());
        const noteData = (await noteResponse.json()).data;
        if (!noteData || typeof noteData.id !== "string") {
            throw new Error("Notes API did not return an entity id");
        }
        const documentResponse = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Desktop drag document",
                body: "Real API document fixture for desktop window drag.",
            }),
        });
        if (!documentResponse.ok) {
            throw new Error(await documentResponse.text());
        }
        const documentData = (await documentResponse.json()).data;
        if (!documentData || typeof documentData.id !== "string") {
            throw new Error("Documents API did not return an entity id");
        }
        const noteId: string = noteData.id;
        const documentId: string = documentData.id;
        return { noteId, documentId };
    });
    await page.reload();
    await page.locator(".desktop-dock").waitFor();

    const notesDock = page.locator(
        '.desktop-dock button[data-workspace="notes"]',
    );
    const notesWindow = page.locator(
        '.desktop-window[data-window-id="notes"]',
    );
    await notesDock.click();
    await notesWindow.waitFor({ state: "visible" });
    await dragWindowByTwenty(page, notesWindow, "notes");
    await notesWindow.locator(".notes-workspace-list .note-title").filter({
        hasText: "Desktop drag note",
    }).click();
    const noteWindow = page.locator(
        `.desktop-window[data-window-id="note:${entityIds.noteId}"]`,
    );
    await noteWindow.waitFor({ state: "visible" });
    await dragWindowByTwenty(page, noteWindow, "note");

    const documentsDock = page.locator(
        '.desktop-dock button[data-workspace="documents"]',
    );
    const documentsWindow = page.locator(
        '.desktop-window[data-window-id="documents"]',
    );
    await documentsDock.click();
    await documentsWindow.waitFor({ state: "visible" });
    await dragWindowByTwenty(page, documentsWindow, "documents");
    await page.locator(
        `[data-document-id="${entityIds.documentId}"] h4 button`,
    ).click();
    const documentWindow = page.locator(
        `.desktop-window[data-window-id="document:${entityIds.documentId}"]`,
    );
    await documentWindow.waitFor({ state: "visible" });
    await dragWindowByTwenty(page, documentWindow, "document");
});
Deno.test("desktop drag clips diagonal and single-frame gestures without dragging controls", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "desktop_drag_m4",
        password: "Desktop-drag-m4!",
        displayName: "Desktop drag M4",
    });
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
    });
    await page.addInitScript(traceSetup);
    await loginAndVisit(page, app.origin, "/", credentials);
    await page.evaluate(async () => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: "widgets" }),
        });
        if (!response.ok) throw new Error(await response.text());
    });
    await page.reload();
    await page.locator(".home-widgets").waitFor({ state: "visible" });

    const appsDock = page.locator(
        '.desktop-dock button[aria-label="应用工作区"]',
    );
    const appsWindow = page.locator(
        '.desktop-window[data-window-id="apps"]',
    );
    async function openApps() {
        await appsDock.waitFor({ state: "visible" });
        await appsDock.click();
        await appsWindow.waitFor({ state: "visible" });
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="apps"][data-window-active="true"]',
            ) !== null
        );
    }
    async function resetWindow() {
        await page.goto(app.origin + "/settings");
        await page.locator("main").waitFor();
        await clearPersistedLayout(page);
        await page.goto(app.origin + "/");
        await page.locator(".home-widgets").waitFor({ state: "visible" });
        await openApps();
    }
    async function assertFrameUnchanged(
        before: FrameBox,
        label: string,
    ) {
        const after = await dragGeometry(page);
        assert(
            Math.abs(after.frame.x - before.x) <= 1 &&
                Math.abs(after.frame.y - before.y) <= 1,
            `${label} must not move the desktop window: before=${
                JSON.stringify(before)
            } after=${JSON.stringify(after.frame)}`,
        );
    }
    await openApps();

    // A single large pointermove followed immediately by pointerup must not be
    // overwritten by a stale pending animation-frame update.
    const largeMoveStart = await dragGeometry(page);
    const largeStart = {
        x: largeMoveStart.title.x + largeMoveStart.title.width / 2,
        y: largeMoveStart.title.y + largeMoveStart.title.height / 2,
    };
    const largeTarget = { x: largeStart.x + 120, y: largeStart.y + 55 };
    const clamp = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(max, value));
    const largeExpected = {
        ...largeMoveStart.frame,
        x: clamp(
            largeMoveStart.frame.x + largeTarget.x - largeStart.x,
            largeMoveStart.bounds.left,
            largeMoveStart.bounds.right,
        ),
        y: clamp(
            largeMoveStart.frame.y + largeTarget.y - largeStart.y,
            largeMoveStart.bounds.top,
            largeMoveStart.bounds.bottom,
        ),
    };
    await page.mouse.move(largeStart.x, largeStart.y);
    await page.mouse.down();
    await page.mouse.move(largeTarget.x, largeTarget.y);
    await page.mouse.up();
    await nextAnimationFrame(page);
    await nextAnimationFrame(page);
    const largeReleased = await dragGeometry(page);
    const largeSettled = await dragGeometry(page);
    await waitForPersistedAppsFrame(page, largeExpected);
    const largePersisted = await readPersistedLayout(page);
    assert(
        Math.abs(largeReleased.frame.x - largeExpected.x) <= 1 &&
            Math.abs(largeReleased.frame.y - largeExpected.y) <= 1 &&
            Math.abs(largeSettled.frame.x - largeExpected.x) <= 1 &&
            Math.abs(largeSettled.frame.y - largeExpected.y) <= 1 &&
            Math.abs(
                    (largePersisted?.window?.frame.x ?? -100) * 1440 -
                        largeExpected.x,
                ) <= 1 &&
            Math.abs(
                    (largePersisted?.window?.frame.y ?? -100) * 900 -
                        largeExpected.y,
                ) <= 1,
        `A single large move released before rAF must commit the last clamped frame without a stale overwrite: ${
            JSON.stringify({
                largeMoveStart,
                largeTarget,
                largeExpected,
                largeReleased,
                largeSettled,
                largePersisted,
            })
        }`,
    );

    await resetWindow();

    // Only X crosses the right boundary during this diagonal gesture; Y keeps
    // tracking the pointer and reverse X remains independent.
    const diagonalStart = await dragGeometry(page);
    const diagonalPoint = {
        x: diagonalStart.title.x + diagonalStart.title.width / 2,
        y: diagonalStart.title.y + diagonalStart.title.height / 2,
    };
    const diagonalTarget = {
        x: diagonalStart.bounds.right +
            diagonalPoint.x - diagonalStart.frame.x + 50,
        y: diagonalPoint.y + 20,
    };
    assert(
        diagonalTarget.x < diagonalStart.viewport.width - 32,
        "The diagonal right-edge gesture must not enter the Snap zone",
    );
    await page.mouse.move(diagonalPoint.x, diagonalPoint.y);
    await page.mouse.down();
    await page.mouse.move(diagonalTarget.x, diagonalTarget.y);
    await nextAnimationFrame(page);
    const diagonalClipped = await dragGeometry(page);
    const diagonalPointerId = await recordedAppsPointerId(page);
    const diagonalCapture = diagonalPointerId === null
        ? false
        : await appsWindow.evaluate((root, pointerId) =>
            [root, ...Array.from(root.querySelectorAll("*"))].some(
                (element) => {
                    try {
                        return element.hasPointerCapture(pointerId);
                    } catch {
                        return false;
                    }
                },
            ), diagonalPointerId);
    await page.mouse.move(diagonalTarget.x - 5, diagonalTarget.y);
    await nextAnimationFrame(page);
    const diagonalReverseX = await dragGeometry(page);
    await page.mouse.up();
    await nextAnimationFrame(page);
    assert(
        Math.abs(diagonalClipped.frame.x - diagonalStart.bounds.right) <= 1 &&
            Math.abs(
                    diagonalClipped.frame.y -
                        diagonalStart.frame.y - 20,
                ) <= 1 &&
            Math.abs(
                    diagonalReverseX.frame.x -
                        diagonalStart.bounds.right + 5,
                ) <= 1 &&
            Math.abs(
                    diagonalReverseX.frame.y -
                        diagonalClipped.frame.y,
                ) <= 1 &&
            diagonalCapture,
        `A clipped diagonal axis must not freeze or alter the orthogonal axis, and reverse X must remain immediate: ${
            JSON.stringify({
                diagonalStart,
                diagonalTarget,
                diagonalClipped,
                diagonalReverseX,
                diagonalPointerId,
                diagonalCapture,
            })
        }`,
    );

    const menuTrigger = appsWindow.locator(
        '[data-testid="window-menu-trigger"]',
    );
    const menu = page.getByTestId("window-menu-content");
    const menuStart = await dragGeometry(page);
    const menuButtonBox = await menuTrigger.boundingBox();
    assert(menuButtonBox, "Apps menu trigger must be visible");
    await page.mouse.move(
        menuButtonBox.x + menuButtonBox.width / 2,
        menuButtonBox.y + menuButtonBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        menuButtonBox.x + menuButtonBox.width / 2 + 32,
        menuButtonBox.y + menuButtonBox.height / 2,
    );
    await page.mouse.up();
    await nextAnimationFrame(page);
    await assertFrameUnchanged(menuStart.frame, "Titlebar menu button");
    if (await menu.isVisible()) {
        await menuTrigger.click();
    }
    await menu.waitFor({ state: "detached" });

    const search = appsWindow.locator("input[data-workspace-search]");
    await search.waitFor({ state: "visible" });
    const inputStart = await dragGeometry(page);
    const inputBox = await search.boundingBox();
    assert(inputBox, "Apps search input must be visible");
    await page.mouse.move(inputBox.x + 30, inputBox.y + inputBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
        inputBox.x + 62,
        inputBox.y + inputBox.height / 2,
    );
    await page.mouse.up();
    await nextAnimationFrame(page);
    await assertFrameUnchanged(inputStart.frame, "Apps search input");

    await menuTrigger.click();
    await menu.waitFor({ state: "visible" });
    const menuBox = await menu.boundingBox();
    assert(menuBox, "Window menu content must be visible");
    const menuDragStart = await dragGeometry(page);
    await page.mouse.move(menuBox.x + menuBox.width - 4, menuBox.y + 8);
    await page.mouse.down();
    await page.mouse.move(menuBox.x + menuBox.width + 40, menuBox.y + 8);
    await page.mouse.up();
    await nextAnimationFrame(page);
    await assertFrameUnchanged(menuDragStart.frame, "Open window menu");
    if (await menu.isVisible()) {
        await menuTrigger.click();
    }
    await menu.waitFor({ state: "detached" });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
        const browserWindow = globalThis as typeof globalThis & {
            __desktopCollisionAdds?: string[];
        };
        const additions: string[] = [];
        browserWindow.__desktopCollisionAdds = additions;
        new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (
                        node instanceof HTMLElement &&
                        node.matches(".desktop-window-collision")
                    ) {
                        additions.push(
                            node.dataset.collisionEdge ?? "missing-edge",
                        );
                    }
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
    });
    const collisionStart = await dragGeometry(page);
    const collisionPointer = {
        x: collisionStart.title.x + collisionStart.title.width / 2,
        y: Math.max(
            collisionStart.title.y + collisionStart.title.height / 2,
            Math.min(
                collisionStart.chrome.bottom - 2,
                collisionStart.bounds.top + 40,
            ),
        ),
    };
    assert(
        collisionPointer.y > collisionStart.bounds.top + 32,
        "Collision feedback must avoid the vertical Snap zone",
    );
    const collisionBoundaryPointer = collisionStart.bounds.right +
        collisionPointer.x - collisionStart.frame.x;
    const collisionTarget = {
        x: collisionBoundaryPointer + 50,
        y: collisionPointer.y,
    };
    assert(
        collisionTarget.x < collisionStart.viewport.width - 32,
        "Collision pulse must be tested outside the Snap zone",
    );
    await page.mouse.move(collisionPointer.x, collisionPointer.y);
    await page.mouse.down();
    await page.mouse.move(collisionTarget.x, collisionTarget.y);
    await nextAnimationFrame(page);
    const collisionLayer = page.locator(
        '.desktop-window-collision[data-collision-edge="right"]',
    );
    await collisionLayer.waitFor({ state: "visible" });
    const collisionStyle = await collisionLayer.evaluate((element) => {
        const style = getComputedStyle(element);
        const durationMilliseconds = (value: string) => {
            const parsed = Number.parseFloat(value);
            return value.trim().endsWith("ms") ? parsed : parsed * 1000;
        };
        return {
            ariaHidden: element.getAttribute("aria-hidden"),
            position: style.position,
            pointerEvents: style.pointerEvents,
            transform: style.transform,
            animationName: style.animationName,
            animationDuration: style.animationDuration.split(",").map(
                durationMilliseconds,
            ),
            animationPlayState: style.animationPlayState,
            transitionProperty: style.transitionProperty.split(",").map(
                (property) => property.trim(),
            ),
            transitionDuration: style.transitionDuration.split(",").map(
                durationMilliseconds,
            ),
            bounds: (() => {
                const bounds = element.getBoundingClientRect();
                return {
                    width: bounds.width,
                    height: bounds.height,
                };
            })(),
        };
    });
    const collisionPulseDurations = [
        ...collisionStyle.animationDuration,
        ...collisionStyle.transitionDuration,
    ];
    assert(
        collisionStyle.ariaHidden === "true" &&
            collisionStyle.position === "absolute" &&
            collisionStyle.pointerEvents === "none" &&
            collisionStyle.transform === "none" &&
            collisionStyle.bounds.width > 0 &&
            collisionStyle.bounds.height > 0 &&
            collisionPulseDurations.some((duration) =>
                duration >= 120 && duration <= 160
            ),
        `Collision feedback must be an absolute, inert, non-transform pulse within 120–160ms: ${
            JSON.stringify(collisionStyle)
        }`,
    );
    await page.mouse.move(collisionTarget.x + 5, collisionTarget.y);
    await nextAnimationFrame(page);
    // Moving along the wall must not rearm that axis's pulse.
    await page.mouse.move(collisionTarget.x + 5, collisionTarget.y + 5);
    await nextAnimationFrame(page);
    await page.mouse.move(collisionTarget.x + 10, collisionTarget.y + 5);
    await nextAnimationFrame(page);
    const sameEdgeAdds = await page.evaluate(() => {
        const browserWindow = globalThis as typeof globalThis & {
            __desktopCollisionAdds?: string[];
        };
        return browserWindow.__desktopCollisionAdds ?? [];
    });
    await page.mouse.move(collisionTarget.x + 5, collisionTarget.y + 5);
    await nextAnimationFrame(page);
    await page.mouse.move(collisionTarget.x + 15, collisionTarget.y + 5);
    await nextAnimationFrame(page);
    const recontactAdds = await page.evaluate(() => {
        const browserWindow = globalThis as typeof globalThis & {
            __desktopCollisionAdds?: string[];
        };
        return browserWindow.__desktopCollisionAdds ?? [];
    });
    await page.mouse.up();
    await nextAnimationFrame(page);
    assert(
        sameEdgeAdds.length === 1 &&
            sameEdgeAdds[0] === "right" &&
            recontactAdds.length === 2 &&
            recontactAdds.every((edge) => edge === "right") &&
            await page.locator(".desktop-window-collision").count() === 0,
        `A held pointer must pulse a wall once, allow a new pulse only after exiting and recontacting, and clear on release: ${
            JSON.stringify({ sameEdgeAdds, recontactAdds })
        }`,
    );

    const snapStart = await dragGeometry(page);
    const snapPointer = {
        x: snapStart.title.x + snapStart.title.width / 2,
        y: snapStart.title.y + snapStart.title.height / 2,
    };
    await page.mouse.move(snapPointer.x, snapPointer.y);
    await page.mouse.down();
    await page.mouse.move(snapPointer.x, 0);
    await nextAnimationFrame(page);
    await page.locator("[data-snap-preview]").waitFor({ state: "visible" });
    assertEquals(
        await page.locator(".desktop-window-collision").count(),
        0,
        "Snap preview must suppress collision feedback",
    );
    await page.mouse.move(
        snapStart.viewport.width / 2,
        Math.min(snapStart.bounds.top + 100, snapStart.viewport.height - 2),
    );
    await nextAnimationFrame(page);
    await page.mouse.up();
    await nextAnimationFrame(page);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedStart = await dragGeometry(page);
    const reducedPointer = {
        x: reducedStart.title.x + reducedStart.title.width / 2,
        y: Math.max(
            reducedStart.title.y + reducedStart.title.height / 2,
            Math.min(
                reducedStart.chrome.bottom - 2,
                reducedStart.bounds.top + 40,
            ),
        ),
    };
    const reducedBoundaryPointer = reducedStart.bounds.right +
        reducedPointer.x - reducedStart.frame.x;
    const reducedTargetX = reducedBoundaryPointer + 50;
    assert(
        reducedTargetX < reducedStart.viewport.width - 32,
        "Reduced-motion collision test must avoid the horizontal Snap zone",
    );
    await page.mouse.move(reducedPointer.x, reducedPointer.y);
    await page.mouse.down();
    await page.mouse.move(
        reducedTargetX,
        reducedPointer.y,
    );
    await nextAnimationFrame(page);
    const reducedLayer = page.locator(
        '.desktop-window-collision[data-collision-edge="right"]',
    );
    await reducedLayer.waitFor({ state: "visible" });
    const reducedMotionActive = await reducedLayer.evaluate((element) =>
        element.getAnimations().some((animation) =>
            animation.playState === "running" ||
            animation.pending
        )
    );
    await page.mouse.up();
    await nextAnimationFrame(page);
    assert(
        !reducedMotionActive &&
            await page.locator(".desktop-window-collision").count() === 0,
        "Reduced motion must keep collision feedback static and release must clear it",
    );

    const fixture = await page.evaluate(async () => {
        const response = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Desktop drag control note",
                body: "A real note used to verify editor interactions.",
                isPinned: false,
                isHomeFixed: false,
            }),
        });
        if (!response.ok) throw new Error(await response.text());
        const data = (await response.json()).data;
        if (!data || typeof data.id !== "string") {
            throw new Error("Notes API did not return a note id");
        }
        return { id: data.id as string };
    });
    await page.reload();
    await page.locator(".desktop-dock").waitFor();
    await page.locator(
        '.desktop-dock button[data-workspace="notes"]',
    ).click();
    const notesWindow = page.locator(
        '.desktop-window[data-window-id="notes"]',
    );
    await notesWindow.waitFor({ state: "visible" });
    await notesWindow.locator(".notes-workspace-list .note-title").filter({
        hasText: "Desktop drag control note",
    }).click();
    const noteWindow = page.locator(
        `.desktop-window[data-window-id="note:${fixture.id}"]`,
    );
    await noteWindow.waitFor({ state: "visible" });
    await noteWindow.getByRole("tab", { name: "源码", exact: true }).click();
    const textarea = noteWindow.locator("textarea.note-body-textarea");
    await textarea.waitFor({ state: "visible" });
    const textareaStart = await dragGeometry(page, noteWindow);
    const textareaBox = await textarea.boundingBox();
    assert(textareaBox, "Note source textarea must be visible");
    const beforeText = await textarea.inputValue();
    await page.mouse.move(
        textareaBox.x + 24,
        textareaBox.y + textareaBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        textareaBox.x + 64,
        textareaBox.y + textareaBox.height / 2,
    );
    await page.mouse.up();
    await nextAnimationFrame(page);
    const textareaAfter = await dragGeometry(page, noteWindow);
    assert(
        Math.abs(textareaAfter.frame.x - textareaStart.frame.x) <= 1 &&
            Math.abs(textareaAfter.frame.y - textareaStart.frame.y) <= 1,
        `Note source textarea interaction must not drag its window: ${
            JSON.stringify({
                before: textareaStart.frame,
                after: textareaAfter.frame,
            })
        }`,
    );
    assertEquals(await textarea.inputValue(), beforeText);
});
