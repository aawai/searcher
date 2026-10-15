import { assert, assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

/**
 * Adds focused canonical-geometry browser contracts while relying on existing
 * suites for shared interaction coverage:
 * - desktop-drag: pointer bounds, capture/cancel/lost-capture, activeId/z-order,
 *   and snap preview.
 * - workspace-shell: seven Snap modes, restore thresholds, resize and reload.
 * - workspace-matrix: constrained 768px no-drag/resize, presets, Maximize/Snap,
 *   and Dock focus.
 * - document-immersion: immersive chrome and snapped 1024x200 fallback with
 *   semantic-mode recovery.
 * This suite covers canonical shrink/grow and pagehide/focus, viewport-specific
 * MOVE/RESIZE, 900px workspace/preset/Dock roundtrip and 900x200 control
 * reachability, measured header/banner/Dock chrome, and snap/maximize/restore
 * drag-out geometry.
 */

async function stableLayout(page: Page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
            document.getAnimations().filter((animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity
            ).map((animation) => animation.finished.catch(() => {})),
        );
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
    });
}

async function createDesktopFixture(username: string) {
    const cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username,
        password: "Desktop-presentation-163!",
        displayName: "Desktop presentation",
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
        reducedMotion: "reduce",
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    await loginAndVisit(page, app.origin, "/", credentials);
    await page.evaluate(async () => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: "widgets", theme: "light" }),
        });
        if (!response.ok) throw new Error(await response.text());
    });
    await page.reload();
    await page.locator(".home-widgets").waitFor({ state: "visible" });
    return { cleanup, page, origin: app.origin };
}

async function openApps(page: Page) {
    const dock = page.locator(
        '.desktop-dock button[aria-label="应用工作区"]',
    );
    await dock.waitFor({ state: "visible" });
    await dock.click();
    const window = page.locator(
        '.desktop-window[data-window-id="apps"]',
    );
    await window.waitFor({ state: "visible" });
    await page.waitForFunction(() =>
        document.querySelector(
            '.desktop-window[data-window-id="apps"][data-window-active="true"]',
        ) !== null
    );
    return window;
}

type PersistedFrame = { x: number; y: number; width: number; height: number };
type PersistedLayout = {
    version: number;
    activeId: string | null;
    windows: Array<{
        id: string;
        frame: PersistedFrame;
        restoreFrame?: PersistedFrame | null;
        mode: string;
        snap?: string | null;
    }>;
};

async function readPersistedLayout(
    page: Page,
): Promise<PersistedLayout | null> {
    return await page.evaluate(async () => {
        const auth = (await (await fetch("/api/auth/me")).json()).data;
        if (!auth?.user?.id) return null;
        const key = `searcher:desktop-layout:v1:${auth.user.id}`;
        return await new Promise<PersistedLayout | null>((resolve, reject) => {
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
                    db.close();
                    resolve(read.result as PersistedLayout | undefined ?? null);
                };
            };
        });
    });
}

async function waitForFrame(
    page: Page,
    windowId: string,
    expected: PersistedFrame,
) {
    await page.waitForFunction(({ windowId, expected }) => {
        const element = document.querySelector<HTMLElement>(
            `.desktop-window[data-window-id="${windowId}"]`,
        );
        if (!element) return false;
        const frame = element.getBoundingClientRect();
        return Math.abs(frame.x - expected.x) <= 1 &&
            Math.abs(frame.y - expected.y) <= 1 &&
            Math.abs(frame.width - expected.width) <= 1 &&
            Math.abs(frame.height - expected.height) <= 1;
    }, { windowId, expected });
}

async function waitForViewport(page: Page, width: number, height: number) {
    await page.waitForFunction(
        ({ width, height }) => innerWidth === width && innerHeight === height,
        { width, height },
    );
}

async function waitForBoundedWindow(
    page: Page,
    windowId: string,
    width: number,
    height: number,
) {
    await page.waitForFunction(
        ({ windowId, width, height }) => {
            if (innerWidth !== width || innerHeight !== height) return false;
            const element = document.querySelector<HTMLElement>(
                `.desktop-window[data-window-id="${windowId}"]`,
            );
            if (!element) return false;
            const frame = element.getBoundingClientRect();
            return frame.width > 0 && frame.height > 0 && frame.left >= 0 &&
                frame.top >= 0 && frame.right <= innerWidth + 1 &&
                frame.bottom <= innerHeight + 1;
        },
        { windowId, width, height },
    );
}

async function dragWindowTo(
    page: Page,
    windowId: string,
    target: { x: number; y: number },
) {
    const window = page.locator(
        `.desktop-window[data-window-id="${windowId}"]`,
    );
    const before = await window.boundingBox();
    const title = await window.locator(".desktop-window-chrome-title")
        .boundingBox();
    assert(before && title, `${windowId} window and title must be rendered`);
    const pointer = {
        x: title.x + title.width / 2,
        y: title.y + title.height / 2,
    };
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down();
    await page.mouse.move(
        pointer.x + target.x - before.x,
        pointer.y + target.y - before.y,
        { steps: 4 },
    );
    await page.mouse.up();
    await waitForFrame(page, windowId, {
        ...before,
        x: target.x,
        y: target.y,
    });
}

async function waitForPersistedNormalFrame(
    page: Page,
    windowId: string,
    frame: PersistedFrame,
    basis: { width: number; height: number },
) {
    await page.waitForFunction(
        async ({ windowId, frame, basis }) => {
            const auth = (await (await fetch("/api/auth/me")).json()).data;
            if (!auth?.user?.id) return false;
            const key = `searcher:desktop-layout:v1:${auth.user.id}`;
            return await new Promise<boolean>((resolve, reject) => {
                const open = indexedDB.open("searcher-client", 1);
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result;
                    const read = db.transaction("state", "readonly")
                        .objectStore("state").get(key);
                    read.onerror = () => {
                        db.close();
                        reject(read.error);
                    };
                    read.onsuccess = () => {
                        const layout = read.result as
                            | PersistedLayout
                            | undefined;
                        const saved = layout?.windows.find((window) =>
                            window.id === windowId
                        );
                        const matches = layout?.version === 4 &&
                            saved?.mode === "normal" &&
                            Math.abs(saved.frame.x * basis.width - frame.x) <=
                                1 &&
                            Math.abs(saved.frame.y * basis.height - frame.y) <=
                                1 &&
                            Math.abs(
                                    saved.frame.width * basis.width -
                                        frame.width,
                                ) <=
                                1 &&
                            Math.abs(
                                    saved.frame.height * basis.height -
                                        frame.height,
                                ) <=
                                1;
                        db.close();
                        resolve(matches);
                    };
                };
            });
        },
        { windowId, frame, basis },
        { polling: 50 },
    );
}

async function waitForWindowMode(
    page: Page,
    windowId: string,
    mode: string,
    snap?: string,
) {
    await page.waitForFunction(
        ({ windowId, mode, snap }) => {
            const element = document.querySelector<HTMLElement>(
                `.desktop-window[data-window-id="${windowId}"]`,
            );
            return element?.getAttribute("data-window-mode") === mode &&
                (snap === undefined ||
                    element.getAttribute("data-window-snap") === snap);
        },
        { windowId, mode, snap },
    );
}

async function waitForPersistedMode(
    page: Page,
    windowId: string,
    mode: string,
    snap?: string,
) {
    await page.waitForFunction(
        async ({ windowId, mode, snap }) => {
            const auth = (await (await fetch("/api/auth/me")).json()).data;
            if (!auth?.user?.id) return false;
            const key = `searcher:desktop-layout:v1:${auth.user.id}`;
            return await new Promise<boolean>((resolve, reject) => {
                const open = indexedDB.open("searcher-client", 1);
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result;
                    const read = db.transaction("state", "readonly")
                        .objectStore("state").get(key);
                    read.onerror = () => {
                        db.close();
                        reject(read.error);
                    };
                    read.onsuccess = () => {
                        const layout = read.result as
                            | PersistedLayout
                            | undefined;
                        const saved = layout?.windows.find((window) =>
                            window.id === windowId
                        );
                        db.close();
                        resolve(
                            saved?.mode === mode &&
                                (snap === undefined || saved.snap === snap),
                        );
                    };
                };
            });
        },
        { windowId, mode, snap },
        { polling: 50 },
    );
}

Deno.test(
    "desktop presentation restores the free-desktop frame after an uncommitted shrink-grow",
    async () => {
        const fixture = await createDesktopFixture(
            "desktop_presentation_shrink",
        );
        await using _cleanup = fixture.cleanup;
        const { page } = fixture;
        const appsWindow = await openApps(page);

        const initialFrame = await appsWindow.boundingBox();
        const title = await appsWindow.locator(
            ".desktop-window-chrome-title",
        ).boundingBox();
        assert(initialFrame && title, "Apps window and title must be rendered");
        const target = { x: 540, y: 160 };
        const pointer = {
            x: title.x + title.width / 2,
            y: title.y + title.height / 2,
        };
        await page.mouse.move(pointer.x, pointer.y);
        await page.mouse.down();
        await page.mouse.move(
            pointer.x + target.x - initialFrame.x,
            pointer.y + target.y - initialFrame.y,
            { steps: 4 },
        );
        await page.mouse.up();
        await waitForFrame(page, "apps", {
            ...initialFrame,
            x: target.x,
            y: target.y,
        });
        await stableLayout(page);
        const placedFrame = await appsWindow.boundingBox();
        assert(placedFrame, "Moved Apps window must remain rendered");

        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForBoundedWindow(page, "apps", 1024, 768);
        await stableLayout(page);
        const constrainedFrame = await appsWindow.boundingBox();
        assert(
            constrainedFrame,
            "Apps window must remain visible after shrink",
        );
        assert(
            Math.abs(constrainedFrame.x - placedFrame.x) > 1,
            "The narrower viewport should present the canonical frame at a clamped position",
        );

        await page.setViewportSize({ width: 1440, height: 900 });
        await waitForViewport(page, 1440, 900);
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="apps"]',
            ) !== null
        );
        await stableLayout(page);
        const restoredFrame = await appsWindow.boundingBox();
        assert(restoredFrame, "Apps window must remain rendered after grow");
        assertEquals(
            {
                x: Math.round(restoredFrame.x),
                y: Math.round(restoredFrame.y),
                width: Math.round(restoredFrame.width),
                height: Math.round(restoredFrame.height),
            },
            {
                x: Math.round(placedFrame.x),
                y: Math.round(placedFrame.y),
                width: Math.round(placedFrame.width),
                height: Math.round(placedFrame.height),
            },
            "A presentation-only viewport shrink must not replace the last user-committed frame",
        );
        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForBoundedWindow(page, "apps", 1024, 768);
        const notesDock = page.locator(
            '.desktop-dock button[aria-label="便签工作区"]',
        );
        await notesDock.click();
        const notesWindow = page.locator(
            '.desktop-window[data-window-id="notes"]',
        );
        await notesWindow.waitFor({ state: "visible" });
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="notes"][data-window-active="true"]',
            ) !== null
        );
        await page.locator(
            '.desktop-dock button[aria-label="应用工作区"]',
        ).click();
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="apps"][data-window-active="true"]',
            ) !== null
        );
        await waitForPersistedNormalFrame(page, "apps", placedFrame, {
            width: 1440,
            height: 900,
        });
        const layoutBeforePagehide = await readPersistedLayout(page);
        const savedAppsBeforePagehide = layoutBeforePagehide?.windows.find(
            (window) => window.id === "apps",
        );
        assertEquals(layoutBeforePagehide?.version, 4);
        assert(savedAppsBeforePagehide, "Apps layout must be persisted");
        assertEquals(
            Object.hasOwn(savedAppsBeforePagehide, "frameBasis"),
            false,
            "Frame basis is runtime-only and must not enter v4 storage",
        );
        assertEquals(
            Object.hasOwn(savedAppsBeforePagehide, "restoreFrameBasis"),
            false,
            "Restore basis is runtime-only and must not enter v4 storage",
        );

        await page.goto(`${fixture.origin}/settings`);
        await page.locator("main").waitFor({ state: "visible" });
        const layoutAfterPagehide = await readPersistedLayout(page);
        const savedAppsAfterPagehide = layoutAfterPagehide?.windows.find(
            (window) => window.id === "apps",
        );
        assert(savedAppsAfterPagehide, "Pagehide must preserve the Apps entry");
        assertEquals(
            savedAppsAfterPagehide.frame,
            savedAppsBeforePagehide.frame,
            "Focus and pagehide after shrink must not serialize the clamped presentation",
        );

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${fixture.origin}/`);
        await page.locator(".home-widgets").waitFor({ state: "visible" });
        await openApps(page);
        await stableLayout(page);
        await waitForFrame(page, "apps", placedFrame);
        const reopenedFrame = await appsWindow.boundingBox();
        assert(
            reopenedFrame,
            "Apps must be rendered after pagehide and reopen",
        );
        console.log(
            `DESKTOP_PRESENTATION ${
                JSON.stringify({
                    case: "shrink-grow-pagehide",
                    before: placedFrame,
                    constrained: constrainedFrame,
                    grown: restoredFrame,
                    reopened: reopenedFrame,
                    persistedV4: savedAppsAfterPagehide.frame,
                })
            }`,
        );
    },
);
Deno.test(
    "MOVE and RESIZE at 1024 become the new free-desktop intent",
    async () => {
        const fixture = await createDesktopFixture(
            "desktop_presentation_commit",
        );
        await using _cleanup = fixture.cleanup;
        const { page } = fixture;
        const appsWindow = await openApps(page);

        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForBoundedWindow(page, "apps", 1024, 768);
        await stableLayout(page);
        const beforeMove = await appsWindow.boundingBox();
        assert(beforeMove, "Apps presentation must be available at 1024");
        const target = {
            x: beforeMove.x > 120 ? 100 : beforeMove.x + 40,
            y: beforeMove.y,
        };
        await dragWindowTo(page, "apps", target);
        await stableLayout(page);
        const movedFrame = await appsWindow.boundingBox();
        assert(movedFrame, "MOVE must leave a visible normal frame");
        await waitForPersistedNormalFrame(page, "apps", movedFrame, {
            width: 1024,
            height: 768,
        });
        const movedLayout = await readPersistedLayout(page);
        const movedRecord = movedLayout?.windows.find((window) =>
            window.id === "apps"
        );
        assert(movedRecord, "MOVE must persist its v4 layout entry");
        assertEquals(
            Object.hasOwn(movedRecord, "frameBasis"),
            false,
            "The runtime basis must stay out of the v4 payload",
        );
        assertEquals(
            Object.hasOwn(movedRecord, "restoreFrameBasis"),
            false,
            "Restore basis must stay out of the v4 payload",
        );

        await page.setViewportSize({ width: 1440, height: 900 });
        await waitForViewport(page, 1440, 900);
        await stableLayout(page);
        await waitForFrame(page, "apps", movedFrame);

        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForBoundedWindow(page, "apps", 1024, 768);
        await stableLayout(page);
        const beforeResize = await appsWindow.boundingBox();
        const southeast = appsWindow.locator(
            ".desktop-window-resize-handle--se",
        );
        const resizeHandle = await southeast.boundingBox();
        assert(
            beforeResize && resizeHandle,
            "Free Desktop resize handle must be exposed at 1024",
        );
        const resizePointer = {
            x: resizeHandle.x + resizeHandle.width / 2,
            y: resizeHandle.y + resizeHandle.height / 2,
        };
        await page.mouse.move(resizePointer.x, resizePointer.y);
        await page.mouse.down();
        await page.mouse.move(resizePointer.x + 32, resizePointer.y, {
            steps: 4,
        });
        await page.mouse.up();
        const resizedExpectation = {
            ...beforeResize,
            width: beforeResize.width + 32,
        };
        await waitForFrame(page, "apps", resizedExpectation);
        await stableLayout(page);
        const resizedFrame = await appsWindow.boundingBox();
        assert(resizedFrame, "RESIZE must leave a visible normal frame");
        await waitForPersistedNormalFrame(page, "apps", resizedFrame, {
            width: 1024,
            height: 768,
        });

        await page.setViewportSize({ width: 1440, height: 900 });
        await waitForViewport(page, 1440, 900);
        await stableLayout(page);
        await waitForFrame(page, "apps", resizedFrame);
        assertEquals(
            await appsWindow.getAttribute("data-window-mode"),
            "normal",
        );
    },
);
Deno.test(
    "constrained workspace presets and measured chrome preserve free-desktop geometry",
    async () => {
        const fixture = await createDesktopFixture(
            "desktop_presentation_constrained",
        );
        await using _cleanup = fixture.cleanup;
        const { page } = fixture;
        const appsWindow = await openApps(page);
        await dragWindowTo(page, "apps", { x: 540, y: 160 });
        await stableLayout(page);
        const freeDesktopFrame = await appsWindow.boundingBox();
        assert(freeDesktopFrame, "Apps must have a normal free-desktop frame");

        const notesDock = page.locator(
            '.desktop-dock button[aria-label="便签工作区"]',
        );
        await notesDock.click();
        const notesWindow = page.locator(
            '.desktop-window[data-window-id="notes"]',
        );
        await notesWindow.waitFor({ state: "visible" });
        const notesFreeDesktopFrame = await notesWindow.boundingBox();
        assert(
            notesFreeDesktopFrame,
            "Notes must have a normal free-desktop frame",
        );
        await waitForPersistedNormalFrame(page, "apps", freeDesktopFrame, {
            width: 1440,
            height: 900,
        });
        await waitForPersistedNormalFrame(
            page,
            "notes",
            notesFreeDesktopFrame,
            {
                width: 1440,
                height: 900,
            },
        );
        const layoutBeforeHost = await readPersistedLayout(page);
        const appsBeforeHost = layoutBeforeHost?.windows.find((window) =>
            window.id === "apps"
        );
        const notesBeforeHost = layoutBeforeHost?.windows.find((window) =>
            window.id === "notes"
        );
        assert(appsBeforeHost, "Apps must be present before constrained mode");
        assert(
            notesBeforeHost,
            "Notes must be present before constrained mode",
        );
        await page.setViewportSize({ width: 900, height: 900 });
        await waitForViewport(page, 900, 900);
        await notesWindow.waitFor({ state: "visible" });
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="notes"] .desktop-window-chrome button[aria-label="窗口尺寸"]',
            ) !== null
        );

        async function selectPreset(label: string) {
            await notesWindow.getByRole("button", {
                name: "窗口尺寸",
                exact: true,
            }).click();
            await page.getByRole("menuitem", { name: label, exact: true })
                .click();
            await page.getByRole("menu").waitFor({ state: "detached" });
            await stableLayout(page);
            const frame = await notesWindow.boundingBox();
            assert(frame, `${label} constrained preset must render`);
            return frame;
        }

        const medium = await notesWindow.boundingBox();
        assert(medium, "Medium constrained frame must render");
        const large = await selectPreset("大尺寸");
        assert(
            large.width > medium.width && large.height > medium.height,
            "Large preset must enlarge the constrained presentation",
        );
        const fullscreen = await selectPreset("全屏");
        assert(
            fullscreen.width > large.width &&
                fullscreen.height > large.height,
            "Fullscreen preset must remain distinct from Large",
        );
        const mediumAfterPresets = await selectPreset("中等尺寸");
        await waitForPersistedNormalFrame(
            page,
            "notes",
            notesFreeDesktopFrame,
            {
                width: 1440,
                height: 900,
            },
        );
        const notesAfterPresetsLayout = await readPersistedLayout(page);
        const notesAfterPresets = notesAfterPresetsLayout?.windows.find((
            window,
        ) => window.id === "notes");
        assert(notesAfterPresets, "Notes must remain persisted after presets");
        assertEquals(
            notesAfterPresets.frame,
            notesBeforeHost.frame,
            "Constrained presets must not replace Notes' canonical geometry",
        );

        await notesWindow.getByRole("button", {
            name: "收起工作区",
            exact: true,
        }).click();
        await waitForWindowMode(page, "notes", "minimized");
        await waitForPersistedMode(page, "notes", "minimized");
        const notesAfterMinimizeLayout = await readPersistedLayout(page);
        const notesAfterMinimize = notesAfterMinimizeLayout?.windows.find((
            window,
        ) => window.id === "notes");
        assert(
            notesAfterMinimize,
            "Constrained minimize must preserve Notes entry",
        );
        assertEquals(
            notesAfterMinimize.frame,
            notesBeforeHost.frame,
            "Constrained minimize must preserve Notes' canonical geometry",
        );

        await notesDock.click();
        await waitForWindowMode(page, "notes", "normal");
        await waitForPersistedNormalFrame(
            page,
            "notes",
            notesFreeDesktopFrame,
            {
                width: 1440,
                height: 900,
            },
        );
        const notesAfterOpenLayout = await readPersistedLayout(page);
        const notesAfterOpen = notesAfterOpenLayout?.windows.find((window) =>
            window.id === "notes"
        );
        assert(notesAfterOpen, "Dock OPEN must restore Notes entry");
        assertEquals(
            notesAfterOpen.frame,
            notesBeforeHost.frame,
            "Constrained Dock OPEN must preserve Notes' canonical geometry",
        );

        await page.setViewportSize({ width: 900, height: 200 });
        await page.waitForFunction(() => {
            if (innerWidth !== 900 || innerHeight !== 200) return false;
            const window = document.querySelector<HTMLElement>(
                '.desktop-window[data-window-id="notes"]',
            );
            const titlebar = window?.querySelector<HTMLElement>(
                ".desktop-window-chrome",
            );
            const close = window?.querySelector<HTMLButtonElement>(
                '.desktop-window-chrome button[aria-label="收起工作区"]',
            );
            if (
                window?.getAttribute("data-window-mode") !== "normal" ||
                !titlebar || !close || close.disabled
            ) return false;
            const titlebarBounds = titlebar.getBoundingClientRect();
            const closeBounds = close.getBoundingClientRect();
            const onScreen = (bounds: DOMRect) =>
                bounds.width > 0 && bounds.height > 0 && bounds.left >= 0 &&
                bounds.top >= 0 && bounds.right <= innerWidth + 1 &&
                bounds.bottom <= innerHeight + 1;
            const hit = document.elementFromPoint(
                closeBounds.left + closeBounds.width / 2,
                closeBounds.top + closeBounds.height / 2,
            );
            return onScreen(titlebarBounds) && onScreen(closeBounds) &&
                !!hit && (hit === close || close.contains(hit));
        });
        const shortHostGeometry = await page.evaluate(() => {
            const window = document.querySelector<HTMLElement>(
                '.desktop-window[data-window-id="notes"]',
            );
            const titlebar = window?.querySelector<HTMLElement>(
                ".desktop-window-chrome",
            );
            const close = window?.querySelector<HTMLButtonElement>(
                '.desktop-window-chrome button[aria-label="收起工作区"]',
            );
            if (!window || !titlebar || !close) {
                throw new Error("Notes titlebar controls must remain rendered");
            }
            const bounds = (element: Element) => {
                const { x, y, width, height } = element.getBoundingClientRect();
                return { x, y, width, height };
            };
            return {
                window: bounds(window),
                titlebar: bounds(titlebar),
                close: bounds(close),
            };
        });
        await waitForPersistedNormalFrame(
            page,
            "notes",
            notesFreeDesktopFrame,
            {
                width: 1440,
                height: 900,
            },
        );
        await page.setViewportSize({ width: 900, height: 900 });
        await waitForBoundedWindow(page, "notes", 900, 900);
        await stableLayout(page);

        console.log(
            `DESKTOP_PRESENTATION ${
                JSON.stringify({
                    case: "constrained-roundtrip",
                    viewport: { width: 900, height: 900 },
                    notesFreeDesktopFrame,
                    notesAfterMinimize: notesAfterMinimize.frame,
                    notesAfterOpen: notesAfterOpen.frame,
                    shortHostGeometry,
                    presets: { medium, large, fullscreen, mediumAfterPresets },
                })
            }`,
        );
        const appsDock = page.locator(
            '.desktop-dock button[aria-label="应用工作区"]',
        );
        await appsDock.click();
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="apps"][data-window-active="true"]',
            ) !== null
        );
        await notesDock.click();
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="notes"][data-window-active="true"]',
            ) !== null
        );
        assertEquals(await appsWindow.count(), 1);
        assertEquals(await notesWindow.count(), 1);

        await waitForPersistedNormalFrame(page, "apps", freeDesktopFrame, {
            width: 1440,
            height: 900,
        });
        const layoutAfterHost = await readPersistedLayout(page);
        const appsAfterHost = layoutAfterHost?.windows.find((window) =>
            window.id === "apps"
        );
        assert(
            appsAfterHost,
            "Apps entry must remain persisted in constrained mode",
        );
        assertEquals(
            appsAfterHost.frame,
            appsBeforeHost.frame,
            "Workspace switching, Dock selection, constrained close/reopen, and presets must not rewrite Apps geometry",
        );

        await page.setViewportSize({ width: 1440, height: 900 });
        await waitForViewport(page, 1440, 900);
        await stableLayout(page);
        await appsDock.click();
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="apps"][data-window-active="true"]',
            ) !== null
        );
        await waitForFrame(page, "apps", freeDesktopFrame);
        await notesDock.click();
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="notes"][data-window-active="true"]',
            ) !== null
        );
        await waitForFrame(page, "notes", notesFreeDesktopFrame);
        await appsDock.click();
        await page.waitForFunction(() =>
            document.querySelector(
                '.desktop-window[data-window-id="apps"][data-window-active="true"]',
            ) !== null
        );

        const beforeChromeChange = await appsWindow.boundingBox();
        assert(
            beforeChromeChange,
            "Apps frame must be visible before chrome change",
        );
        const layoutBeforeChrome = await readPersistedLayout(page);
        const savedBeforeChrome = layoutBeforeChrome?.windows.find((window) =>
            window.id === "apps"
        );
        assert(savedBeforeChrome, "Apps layout must remain persisted");
        await waitForPersistedNormalFrame(page, "apps", beforeChromeChange, {
            width: 1440,
            height: 900,
        });
        const topbar = page.locator(".topbar");
        const topbarBefore = await topbar.boundingBox();
        assert(topbarBefore, "Header must be measurable");
        await topbar.evaluate((element) => {
            (element as HTMLElement).style.setProperty(
                "height",
                "200px",
                "important",
            );
        });
        await page.waitForFunction(() => {
            const header = document.querySelector<HTMLElement>(".topbar");
            return !!header && header.getBoundingClientRect().height >= 199;
        });
        await page.waitForFunction(() => {
            const header = document.querySelector<HTMLElement>(".topbar");
            const window = document.querySelector<HTMLElement>(
                '.desktop-window[data-window-id="apps"]',
            );
            return !!header && !!window &&
                window.getBoundingClientRect().y >=
                    header.getBoundingClientRect().bottom - 1;
        });
        const withTallHeader = await appsWindow.boundingBox();
        assert(withTallHeader, "Apps remains rendered under measured header");
        assert(
            withTallHeader.y > beforeChromeChange.y,
            "Header remeasurement must change only the presentation frame",
        );
        await waitForPersistedNormalFrame(page, "apps", beforeChromeChange, {
            width: 1440,
            height: 900,
        });
        await topbar.evaluate((element) =>
            (element as HTMLElement).style.removeProperty("height")
        );
        await page.waitForFunction((height) => {
            const header = document.querySelector<HTMLElement>(".topbar");
            return !!header &&
                Math.abs(header.getBoundingClientRect().height - height) <= 1;
        }, topbarBefore.height);
        await waitForFrame(page, "apps", beforeChromeChange);

        const bannerBounds = await page.evaluate(() => {
            const topbar = document.querySelector<HTMLElement>(".topbar");
            if (!topbar) throw new Error("Topbar is missing");
            const banner = document.createElement("aside");
            banner.className = "connection-banner";
            banner.setAttribute("role", "status");
            Object.assign(banner.style, {
                position: "fixed",
                top: `${topbar.getBoundingClientRect().bottom}px`,
                left: "0",
                right: "0",
                height: "120px",
                display: "block",
                zIndex: "1000",
            });
            document.body.append(banner);
            const bounds = banner.getBoundingClientRect();
            return { top: bounds.top, bottom: bounds.bottom };
        });
        await page.waitForFunction(({ bottom }) => {
            const banner = document.querySelector(".connection-banner");
            const window = document.querySelector<HTMLElement>(
                '.desktop-window[data-window-id="apps"]',
            );
            return !!banner && !!window &&
                window.getBoundingClientRect().y >= bottom - 1;
        }, bannerBounds);
        await stableLayout(page);
        const withBanner = await appsWindow.boundingBox();
        assert(withBanner, "Apps remains rendered under measured banner");
        assert(
            withBanner.y > beforeChromeChange.y,
            "A measured connection banner may change presentation but not canonical geometry",
        );
        await waitForPersistedNormalFrame(page, "apps", beforeChromeChange, {
            width: 1440,
            height: 900,
        });
        await page.evaluate(() =>
            document.querySelector(".connection-banner")?.remove()
        );
        await waitForFrame(page, "apps", beforeChromeChange);

        const dock = page.locator(".desktop-dock");
        const dockBefore = await dock.boundingBox();
        assert(dockBefore, "Desktop Dock must be measurable");
        await dock.evaluate((element) => {
            (element as HTMLElement).style.setProperty(
                "height",
                "720px",
                "important",
            );
        });
        await page.waitForFunction(() => {
            const element = document.querySelector<HTMLElement>(
                ".desktop-dock",
            );
            return !!element &&
                element.getBoundingClientRect().height >= 719;
        });
        await page.waitForFunction((y) => {
            const window = document.querySelector<HTMLElement>(
                '.desktop-window[data-window-id="apps"]',
            );
            return !!window && window.getBoundingClientRect().y < y;
        }, beforeChromeChange.y);
        await stableLayout(page);
        const withLargeDock = await appsWindow.boundingBox();
        assert(withLargeDock, "Apps remains rendered under measured Dock");
        assert(
            withLargeDock.y < beforeChromeChange.y,
            "Dock remeasurement must clamp presentation without committing the frame",
        );
        await waitForPersistedNormalFrame(page, "apps", beforeChromeChange, {
            width: 1440,
            height: 900,
        });
        await dock.evaluate((element) =>
            (element as HTMLElement).style.removeProperty("height")
        );
        await page.waitForFunction((height) => {
            const element = document.querySelector<HTMLElement>(
                ".desktop-dock",
            );
            return !!element &&
                Math.abs(element.getBoundingClientRect().height - height) <= 1;
        }, dockBefore.height);
        await waitForFrame(page, "apps", beforeChromeChange);
        const layoutAfterChrome = await readPersistedLayout(page);
        const savedAfterChrome = layoutAfterChrome?.windows.find((window) =>
            window.id === "apps"
        );
        assert(
            savedAfterChrome,
            "Apps layout must remain present after chrome changes",
        );
        assertEquals(
            savedAfterChrome.frame,
            savedBeforeChrome.frame,
            "Header, connection banner, and Dock geometry are presentation-only",
        );
    },
);
Deno.test(
    "Snap, maximize, restore, and drag-out resolve current presentation geometry",
    async () => {
        const fixture = await createDesktopFixture(
            "desktop_presentation_snap",
        );
        await using _cleanup = fixture.cleanup;
        const { page } = fixture;
        const appsWindow = await openApps(page);
        await dragWindowTo(page, "apps", { x: 420, y: 170 });
        await stableLayout(page);
        const normalFrame = await appsWindow.boundingBox();
        assert(normalFrame, "Normal Apps frame must be visible");
        await waitForPersistedNormalFrame(page, "apps", normalFrame, {
            width: 1440,
            height: 900,
        });
        const beforeMaximize = await readPersistedLayout(page);
        const appsBeforeMaximize = beforeMaximize?.windows.find((window) =>
            window.id === "apps"
        );
        assert(appsBeforeMaximize, "Normal frame must be persisted");

        await appsWindow.getByRole("button", {
            name: "最大化窗口",
            exact: true,
        }).click();
        await waitForWindowMode(page, "apps", "maximized");
        await waitForPersistedMode(page, "apps", "maximized", "maximize");
        await stableLayout(page);
        const maxAtWide = await appsWindow.boundingBox();
        assert(maxAtWide, "Maximized window must be visible");

        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForViewport(page, 1024, 768);
        await waitForWindowMode(page, "apps", "maximized");
        await waitForBoundedWindow(page, "apps", 1024, 768);
        await stableLayout(page);
        const maxAtNarrow = await appsWindow.boundingBox();
        assert(
            maxAtNarrow,
            "Maximized presentation must survive viewport shrink",
        );
        assert(
            maxAtNarrow.width < maxAtWide.width &&
                maxAtNarrow.height < maxAtWide.height,
            "Maximize must follow the current Work Rect",
        );
        const afterMaximizeShrink = await readPersistedLayout(page);
        const appsAfterMaximizeShrink = afterMaximizeShrink?.windows.find(
            (window) => window.id === "apps",
        );
        assert(appsAfterMaximizeShrink, "Maximized Apps entry must persist");
        assertEquals(
            appsAfterMaximizeShrink.frame,
            appsBeforeMaximize.frame,
            "A viewport change must not replace the maximized restore geometry",
        );

        await appsWindow.locator(
            '.desktop-window-chrome-btn--restore, button[aria-label*="还原"]',
        ).first().click();
        await waitForWindowMode(page, "apps", "normal");
        await stableLayout(page);
        const restoredMaxFrame = await appsWindow.boundingBox();
        assert(
            restoredMaxFrame,
            "Maximized Restore must produce a normal frame",
        );
        await waitForPersistedNormalFrame(page, "apps", restoredMaxFrame, {
            width: 1024,
            height: 768,
        });
        await page.setViewportSize({ width: 1440, height: 900 });
        await waitForViewport(page, 1440, 900);
        await stableLayout(page);
        await waitForFrame(page, "apps", restoredMaxFrame);

        const beforeSnap = await appsWindow.boundingBox();
        assert(beforeSnap, "Normal frame must be visible before Snap");
        await appsWindow.getByRole("button", {
            name: "窗口系统菜单",
            exact: true,
        }).click();
        await page.getByRole("menuitem", { name: "靠左分屏", exact: true })
            .click();
        await waitForWindowMode(page, "apps", "snapped", "left");
        await waitForPersistedMode(page, "apps", "snapped", "left");
        await stableLayout(page);
        const snapAtWide = await appsWindow.boundingBox();
        assert(snapAtWide, "Snapped window must be visible");
        const beforeSnapShrink = await readPersistedLayout(page);
        const appsBeforeSnapShrink = beforeSnapShrink?.windows.find((window) =>
            window.id === "apps"
        );
        assert(appsBeforeSnapShrink, "Snapped Apps entry must persist");

        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForViewport(page, 1024, 768);
        await waitForBoundedWindow(page, "apps", 1024, 768);
        await waitForWindowMode(page, "apps", "snapped", "left");
        await stableLayout(page);
        const snapAtNarrow = await appsWindow.boundingBox();
        assert(snapAtNarrow, "Snap presentation must survive viewport shrink");
        assert(
            snapAtNarrow.width < snapAtWide.width,
            "Left Snap must adapt to the smaller Work Rect",
        );
        const afterSnapShrink = await readPersistedLayout(page);
        const appsAfterSnapShrink = afterSnapShrink?.windows.find((window) =>
            window.id === "apps"
        );
        assert(appsAfterSnapShrink, "Snapped Apps entry must remain persisted");
        assertEquals(
            appsAfterSnapShrink.frame,
            appsBeforeSnapShrink.frame,
            "Snap presentation changes must preserve its canonical normal frame",
        );

        await appsWindow.locator(
            '.desktop-window-chrome-btn--restore, button[aria-label*="还原"]',
        ).first().click();
        await waitForWindowMode(page, "apps", "normal");
        await stableLayout(page);
        const restoredSnapFrame = await appsWindow.boundingBox();
        assert(restoredSnapFrame, "Snap Restore must produce a normal frame");
        await waitForPersistedNormalFrame(page, "apps", restoredSnapFrame, {
            width: 1024,
            height: 768,
        });
        await page.setViewportSize({ width: 1440, height: 900 });
        await waitForViewport(page, 1440, 900);
        await stableLayout(page);
        await waitForFrame(page, "apps", restoredSnapFrame);

        await appsWindow.getByRole("button", {
            name: "最大化窗口",
            exact: true,
        }).click();
        await waitForWindowMode(page, "apps", "maximized");
        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForViewport(page, 1024, 768);
        await waitForBoundedWindow(page, "apps", 1024, 768);
        await waitForWindowMode(page, "apps", "maximized");
        await stableLayout(page);
        const maximizedFrame = await appsWindow.boundingBox();
        const title = await appsWindow.locator(
            ".desktop-window-chrome-title",
        ).boundingBox();
        assert(
            maximizedFrame && title,
            "Maximized titlebar must be measurable",
        );
        const grabRatio = 0.68;
        const pointerStart = {
            x: maximizedFrame.x + maximizedFrame.width * grabRatio,
            y: title.y + title.height / 2,
        };
        await page.mouse.move(pointerStart.x, pointerStart.y);
        await page.mouse.down();
        await page.mouse.move(pointerStart.x + 20, pointerStart.y + 8, {
            steps: 4,
        });
        await page.waitForFunction((maxWidth) => {
            const window = document.querySelector<HTMLElement>(
                '.desktop-window[data-window-id="apps"]',
            );
            return !!window &&
                window.getBoundingClientRect().width < maxWidth - 4;
        }, maximizedFrame.width);
        await stableLayout(page);
        const firstNormalFrame = await appsWindow.boundingBox();
        assert(
            firstNormalFrame,
            "Maximize drag-out must create a normal preview",
        );
        const pointerAfterActivation = {
            x: pointerStart.x + 20,
            y: pointerStart.y + 8,
        };
        const actualGrabRatio = (pointerAfterActivation.x -
            firstNormalFrame.x) / firstNormalFrame.width;
        assert(
            Math.abs(actualGrabRatio - grabRatio) <= 0.03,
            `Drag-out must preserve the titlebar grab ratio: expected=${grabRatio} actual=${actualGrabRatio} frame=${
                JSON.stringify(firstNormalFrame)
            }`,
        );
        await page.mouse.move(pointerStart.x + 48, pointerStart.y + 16, {
            steps: 3,
        });
        await page.mouse.up();
        await waitForWindowMode(page, "apps", "normal");
        await stableLayout(page);
        const draggedOutFrame = await appsWindow.boundingBox();
        assert(draggedOutFrame, "Drag-out must commit a normal frame");
        await waitForPersistedNormalFrame(page, "apps", draggedOutFrame, {
            width: 1024,
            height: 768,
        });
        await page.setViewportSize({ width: 1440, height: 900 });
        await waitForViewport(page, 1440, 900);
        await stableLayout(page);
        await waitForFrame(page, "apps", draggedOutFrame);
        console.log(
            `DESKTOP_PRESENTATION ${
                JSON.stringify({
                    case: "snap-maximize-drag-out",
                    normal: normalFrame,
                    maximizedBeforeDragOut: maximizedFrame,
                    firstNormalPreview: firstNormalFrame,
                    committedNormal: draggedOutFrame,
                    grabRatio: {
                        expected: grabRatio,
                        actual: actualGrabRatio,
                    },
                })
            }`,
        );
    },
);
