import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals } from "@std/assert";
import {
    type Browser,
    type BrowserContext,
    type CDPSession,
    type Locator,
    type Page,
} from "playwright";
import { chromium } from "./helpers/browser.ts";
import { startProductionApp } from "./helpers/production-app.ts";
import { openMoreApps } from "./helpers/app-library.ts";

// Issue #244: the home page is the application library. These regressions pin
// the density contract of its grid (docs/apps.md 首页应用库): fixed glyphs,
// square cells, 2x2 large folders, row-major alignment, bottom clearance and
// 44px touch targets, on touch (mobile/tablet) and fine-pointer desktop.

type Theme = "light" | "dark";
type Viewport = { width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };
type Geometry = { cell: number; gap: number; glyph: number };

type Metrics = {
    availableWidth: number;
    grid: Box & { scrollWidth: number; clientWidth: number; bottom: number };
    columns: number;
    formulaColumns: number;
    cell: number;
    rowHeight: number;
    columnGap: number;
    rowGap: number;
    columnTracks: number[];
    rowTracks: number[];
    glyph: Box | null;
    tiles: Array<{ id: string | null; kind: string; box: Box }>;
    overlaps: string[];
    outOfBounds: string[];
    folders: Array<{
        id: string;
        size: "small" | "large";
        box: Box;
        previewCount: number;
        previewButtonCount: number;
        remainderLabel: string;
        remainderCount: number;
    }>;
    moreLabel: string | null;
};

type Fixtures = {
    smallGroupId: string;
    largeGroupId: string;
    /** Root tiles: loose apps plus the two folders. */
    rootTileCount: number;
    smallFolderAppCount: number;
    largeFolderAppCount: number;
};

const TOUCH_VIEWPORTS: Viewport[] = [
    { width: 375, height: 812 },
    { width: 390, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 767, height: 1024 },
    { width: 768, height: 1024 },
];
const THEMES: Theme[] = ["light", "dark"];
const HOME = ".launcher-library .launcher-grid--home";
const BOTTOM_CLEARANCE = 48;

function assertNear(
    actual: number,
    expected: number,
    message: string,
    tolerance = 0.75,
) {
    assert(
        Math.abs(actual - expected) <= tolerance,
        `${message}: expected ${expected} ± ${tolerance}px, received ${actual}px`,
    );
}

/** Documented tracks: standard 84/12 desktop, 64/6 mobile; touch 88/12, 68/4. */
function expectedGeometry(viewport: Viewport, coarse: boolean): Geometry {
    const wide = viewport.width >= 768;
    if (coarse) {
        return wide
            ? { cell: 88, gap: 12, glyph: 48 }
            : { cell: 68, gap: 4, glyph: 44 };
    }
    return wide
        ? { cell: 84, gap: 12, glyph: 48 }
        : { cell: 64, gap: 6, glyph: 44 };
}

async function setTheme(page: Page, theme: Theme) {
    const ok = await page.evaluate(async (theme) => {
        const result = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme }),
        });
        return result.ok;
    }, theme);
    assertEquals(ok, true, `Could not set ${theme} preferences`);
}

async function register(page: Page, origin: string, username: string) {
    await page.goto(origin + "/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Apps density tester");
    await page.locator("#auth-password").fill("Apps-density-password-149!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });
}

async function seedFixtures(page: Page): Promise<Fixtures> {
    return await page.evaluate(async () => {
        async function post<T>(path: string, body: unknown): Promise<T> {
            const response = await fetch(path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const text = await response.text();
            if (!response.ok) {
                throw new Error(
                    `POST ${path} failed (${response.status}): ${text}`,
                );
            }
            return (JSON.parse(text) as { data: T }).data;
        }
        const createApp = (params: {
            name: string;
            url: string;
            sortOrder: number;
            groupId?: string;
        }) =>
            post<{ id: string }>("/api/webapps", {
                ...params,
                groupId: params.groupId ?? null,
                iconSource: "default",
                openMode: "global",
            });

        // Folders lead the canonical order so both stay on the first rows of
        // every viewport; the loose apps overflow into 更多（N）.
        const smallGroup = await post<{ id: string }>("/api/webapp-groups", {
            name: "Small Sparse Folder",
            sortOrder: 0,
            folderSize: "small",
        });
        const largeGroup = await post<{ id: string }>("/api/webapp-groups", {
            name: "Large Full Folder",
            sortOrder: 1,
            folderSize: "large",
        });
        const looseCount = 20;
        for (let index = 0; index < looseCount; index++) {
            await createApp({
                name: `Loose App ${String(index + 1).padStart(2, "0")}`,
                url: `https://loose-${index + 1}.example/`,
                sortOrder: index + 2,
            });
        }
        for (let index = 0; index < 2; index++) {
            await createApp({
                name: `Sparse ${index + 1}`,
                url: `https://sparse-${index + 1}.example/`,
                groupId: smallGroup.id,
                sortOrder: index,
            });
        }
        for (let index = 0; index < 10; index++) {
            await createApp({
                name: `Full Preview ${index + 1}`,
                url: `https://full-${index + 1}.example/`,
                groupId: largeGroup.id,
                sortOrder: index,
            });
        }
        return {
            smallGroupId: smallGroup.id,
            largeGroupId: largeGroup.id,
            rootTileCount: looseCount + 2,
            smallFolderAppCount: 2,
            largeFolderAppCount: 10,
        };
    });
}

async function settlePresentation(page: Page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
            document.getAnimations().filter((animation) =>
                Number.isFinite(animation.effect?.getComputedTiming().endTime)
            ).map((animation) => animation.finished.catch(() => {})),
        );
        for (let frame = 0; frame < 2; frame++) {
            const { promise, resolve } = Promise.withResolvers<number>();
            requestAnimationFrame(resolve);
            await promise;
        }
    });
}

/**
 * Wait for the grid to be settled at the current viewport: columns follow the
 * measured parent width (ResizeObserver), tiles are laid out and the viewport
 * has the requested width.
 */
async function waitForHome(page: Page, width: number, theme?: Theme) {
    await page.locator(HOME).waitFor({ state: "visible" });
    await page.waitForFunction(({ selector, width, theme }) => {
        if (innerWidth !== width) return false;
        if (theme && document.documentElement.dataset.theme !== theme) {
            return false;
        }
        const grid = document.querySelector<HTMLElement>(selector);
        const parent = grid?.parentElement;
        if (!grid || !parent) return false;
        const style = getComputedStyle(grid);
        const cell = Number.parseFloat(
            style.getPropertyValue("--launcher-col-w"),
        );
        const gap = Number.parseFloat(style.columnGap);
        const available = parent.clientWidth;
        if (!(cell > 0) || !(available > 0)) return false;
        const expected = Math.max(
            2,
            Math.floor((available + gap) / (cell + gap)),
        );
        return Number(grid.dataset.columns) === expected &&
            grid.querySelector(":scope > .launcher-tile[data-tile-id]") !==
                null;
    }, { selector: HOME, width, theme });
    await settlePresentation(page);
}

async function collectMetrics(
    page: Page,
    fixtures: Fixtures,
    selector = HOME,
): Promise<Metrics> {
    return await page.evaluate(({ fixture, selector }) => {
        const grid = document.querySelector<HTMLElement>(selector);
        if (!grid?.parentElement) throw new Error(`${selector} is missing`);
        const container = grid.parentElement;
        const gridStyle = getComputedStyle(grid);
        const containerStyle = getComputedStyle(container);
        const gridRect = grid.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const px = (value: string) => Number.parseFloat(value) || 0;
        const availableWidth = Math.max(
            0,
            containerRect.width - px(containerStyle.borderLeftWidth) -
                px(containerStyle.borderRightWidth) -
                px(containerStyle.paddingLeft) -
                px(containerStyle.paddingRight),
        );
        const cell = px(gridStyle.getPropertyValue("--launcher-col-w"));
        const columnGap = px(gridStyle.columnGap);
        const box = (rect: DOMRect) => ({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        });
        const tiles = Array.from(
            grid.querySelectorAll<HTMLElement>(":scope > .launcher-tile"),
        ).map((tile) => ({
            id: tile.dataset.tileId ?? null,
            kind: tile.querySelector(".launcher-folder-item--large")
                ? "large-folder"
                : tile.querySelector(".launcher-folder-item--small")
                ? "small-folder"
                : "app",
            box: box(tile.getBoundingClientRect()),
        }));
        const overlaps: string[] = [];
        for (let left = 0; left < tiles.length; left++) {
            for (let right = left + 1; right < tiles.length; right++) {
                const a = tiles[left].box;
                const b = tiles[right].box;
                const width = Math.min(a.x + a.width, b.x + b.width) -
                    Math.max(a.x, b.x);
                const height = Math.min(a.y + a.height, b.y + b.height) -
                    Math.max(a.y, b.y);
                if (width > 0.75 && height > 0.75) {
                    overlaps.push(`${left} overlaps ${right}`);
                }
            }
        }
        const outOfBounds = tiles.flatMap((tile, index) => {
            const result: string[] = [];
            if (tile.box.x < gridRect.left - 1) result.push(`${index} left`);
            if (tile.box.x + tile.box.width > gridRect.right + 1) {
                result.push(`${index} right`);
            }
            if (tile.box.y < gridRect.top - 1) result.push(`${index} above`);
            if (tile.box.y + tile.box.height > gridRect.bottom + 1) {
                result.push(`${index} below`);
            }
            return result;
        });
        const folders = [fixture.smallGroupId, fixture.largeGroupId].flatMap(
            (id) => {
                const tile = grid.querySelector<HTMLElement>(
                    `:scope > .launcher-tile[data-folder-id="${id}"]`,
                );
                if (!tile) return [];
                const preview = tile.querySelector<HTMLElement>(
                    ".launcher-folder-preview",
                );
                const remainder = tile.querySelector<HTMLElement>(
                    ".launcher-folder-remainder",
                );
                return [{
                    id,
                    size: tile.querySelector(".launcher-folder-item--large")
                        ? "large" as const
                        : "small" as const,
                    box: box(tile.getBoundingClientRect()),
                    previewCount: preview?.querySelectorAll(
                        ".launcher-folder-mini",
                    ).length ?? 0,
                    previewButtonCount: preview?.querySelectorAll(
                        "button.launcher-folder-mini",
                    ).length ?? 0,
                    remainderLabel: remainder?.getAttribute("aria-label") ?? "",
                    remainderCount: remainder?.querySelectorAll(
                        ".webapp-glyph",
                    ).length ?? 0,
                }];
            },
        );
        const glyph = grid.querySelector<HTMLElement>(
            ".launcher-tile:not([data-folder-id]) .webapp-glyph",
        )?.getBoundingClientRect();
        return {
            availableWidth,
            grid: {
                ...box(gridRect),
                scrollWidth: grid.scrollWidth,
                clientWidth: grid.clientWidth,
                bottom: gridRect.bottom,
            },
            columns: Number(grid.dataset.columns),
            formulaColumns: Math.max(
                2,
                Math.floor((availableWidth + columnGap) / (cell + columnGap)),
            ),
            cell,
            rowHeight: px(gridStyle.getPropertyValue("--launcher-row-h")),
            columnGap,
            rowGap: px(gridStyle.rowGap),
            columnTracks: gridStyle.gridTemplateColumns.split(" ").map(
                Number.parseFloat,
            ),
            rowTracks: gridStyle.gridTemplateRows.split(" ").map(
                Number.parseFloat,
            ),
            glyph: glyph ? box(glyph) : null,
            tiles,
            overlaps,
            outOfBounds,
            folders,
            moreLabel: grid.querySelector("[data-library-cell='more']")
                ?.getAttribute("aria-label") ?? null,
        };
    }, { fixture: fixtures, selector });
}

function assertDensity(
    metrics: Metrics,
    viewport: Viewport,
    coarse: boolean,
    rootTileCount: number,
) {
    const expected = expectedGeometry(viewport, coarse);
    const { cell, gap, glyph } = expected;
    assertNear(metrics.cell, cell, "Home column track");
    assertNear(metrics.rowHeight, cell, "Home row track is square");
    assertNear(metrics.columnGap, gap, "Home column gap");
    assertNear(metrics.rowGap, gap, "Home row gap equals column gap");
    assert(metrics.availableWidth > 0, "Home content width must be positive");
    assertEquals(
        metrics.columns,
        metrics.formulaColumns,
        `Grid columns must derive from the measured width ${metrics.availableWidth}px`,
    );
    assertEquals(
        metrics.columnTracks,
        Array(metrics.columns).fill(cell),
        "Computed CSS column tracks",
    );
    assert(
        metrics.rowTracks.length >= 1 && metrics.rowTracks.length <= 4,
        `Home shows at most four rows: ${metrics.rowTracks.length}`,
    );
    assert(
        metrics.rowTracks.every((track) => Math.abs(track - cell) <= 0.75),
        "Computed CSS row tracks",
    );
    assertEquals(metrics.overlaps, [], "Home tiles must not overlap");
    assertEquals(metrics.outOfBounds, [], "Home tiles stay inside the grid");
    assert(
        metrics.grid.scrollWidth <= metrics.grid.clientWidth + 1,
        "Home grid must not overflow horizontally",
    );
    const firstRowY = Math.min(...metrics.tiles.map((tile) => tile.box.y));
    assertNear(firstRowY, metrics.grid.y, "Grid starts at its first row");
    const pitch = cell + gap;
    for (const tile of metrics.tiles) {
        const row = Math.round((tile.box.y - firstRowY) / pitch);
        assertNear(tile.box.y, firstRowY + row * pitch, "Measured row pitch");
        if (tile.kind === "large-folder") {
            assertNear(tile.box.width, 2 * cell + gap, "Large folder width");
            assertNear(tile.box.height, 2 * cell + gap, "Large folder height");
        } else {
            assertNear(tile.box.width, cell, "Ordinary tile width");
            assertNear(tile.box.height, cell, "Ordinary tile height");
        }
    }
    assert(metrics.glyph !== null, "Home must render an app glyph");
    assertNear(metrics.glyph.width, glyph, "Home app glyph width");
    assertNear(metrics.glyph.height, glyph, "Home app glyph height");

    // The tiles cover every row the viewport can hold: either four rows, or
    // one more row (counted by its pitch: row plus gap) would break the 48px
    // bottom clearance.
    const viewportHeight = viewport.height;
    assert(
        metrics.grid.bottom <= viewportHeight - BOTTOM_CLEARANCE + 0.75,
        `Grid bottom ${metrics.grid.bottom} must keep ${BOTTOM_CLEARANCE}px clear of the ${viewportHeight}px viewport`,
    );
    if (metrics.rowTracks.length < 4) {
        assert(
            metrics.grid.bottom + pitch + gap >
                viewportHeight - BOTTOM_CLEARANCE - 0.75,
            `Another row would still fit: bottom ${metrics.grid.bottom}, viewport ${viewportHeight}`,
        );
    }

    // Every root tile is either on the grid or counted by 更多（N）.
    const visible = metrics.tiles.filter((tile) => tile.id !== null).length;
    const hidden = metrics.moreLabel === null
        ? 0
        : Number(/^更多（([1-9]\d*)）$/.exec(metrics.moreLabel)?.[1]);
    assert(
        Number.isInteger(hidden),
        `Malformed 更多 label: ${metrics.moreLabel}`,
    );
    assertEquals(
        visible + hidden,
        rootTileCount,
        "Visible tiles plus the 更多（N） count equal the root tile count",
    );
}

function assertFolderPreviews(metrics: Metrics, coarse: boolean) {
    const small = metrics.folders.find((folder) => folder.size === "small");
    const large = metrics.folders.find((folder) => folder.size === "large");
    assert(small && large, "Both folders must be rendered on the home grid");
    assertEquals(small.previewCount, 2, "Small folder 2x2 preview count");
    assertEquals(
        small.previewButtonCount,
        0,
        "Small folder preview glyphs are not interactive",
    );
    // 10 members: touch previews 3 clickable + remainder, fine pointers 8 + remainder.
    const clickable = coarse ? 3 : 8;
    assertEquals(
        large.previewCount,
        clickable + 1,
        "Large folder preview cells",
    );
    assertEquals(large.previewButtonCount, clickable + 1);
    assertEquals(
        large.remainderLabel,
        `打开文件夹 Large Full Folder，另有 ${10 - clickable} 个应用`,
    );
    assertEquals(
        large.remainderCount,
        Math.min(4, 10 - clickable),
        "Remainder cell previews the first remaining apps",
    );
}

async function assertTouchTarget(
    locator: Locator,
    label: string,
    anchor: "center" | "bottom-edge" = "center",
) {
    await locator.scrollIntoViewIfNeeded();
    const measurement = await locator.evaluate((node, position) => {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        const point = {
            x: rect.left + rect.width / 2,
            y: position === "bottom-edge"
                ? rect.bottom - 6
                : rect.top + rect.height / 2,
        };
        // Large folders are mostly covered by their preview buttons: the
        // opener is reachable along the bottom edge of the surface.
        const hits = [document.elementFromPoint(point.x, point.y)];
        return {
            width: rect.width,
            height: rect.height,
            hit: hits.every((hit) =>
                hit === element || Boolean(hit && element.contains(hit))
            ),
            point,
            hitElement: hits[0]?.tagName.toLowerCase() ?? null,
        };
    }, anchor);
    assert(
        measurement.width >= 44 && measurement.height >= 44,
        `${label} target must be at least 44x44px; ${
            JSON.stringify(measurement)
        }`,
    );
    assertEquals(
        measurement.hit,
        true,
        `${label} hit test at (${measurement.point.x}, ${measurement.point.y}) must land on the target, got ${measurement.hitElement}`,
    );
}

async function assertHomeHitTargets(page: Page) {
    const grid = page.locator(HOME);
    await assertTouchTarget(
        grid.locator(".launcher-tile:not([data-folder-id]) .webapp-icon")
            .first(),
        "Home app",
    );
    await assertTouchTarget(
        grid.locator(
            ".launcher-folder-item--small .launcher-folder-background",
        ),
        "Small folder opener",
    );
    await assertTouchTarget(
        grid.locator(
            ".launcher-folder-item--large .launcher-folder-background",
        ),
        "Large folder opener strip",
        "bottom-edge",
    );
    const previews = grid.locator(
        ".launcher-folder-item--large button.launcher-folder-mini",
    );
    for (let index = 0; index < await previews.count(); index++) {
        await assertTouchTarget(
            previews.nth(index),
            `Large folder preview ${index + 1}`,
        );
    }
    // Over capacity the last cell is 更多（N）; otherwise the add cell is shown.
    const overflowCell = grid.locator(
        "[data-library-cell='more'], [data-library-cell='add']",
    );
    assertEquals(await overflowCell.count(), 1, "One trailing library cell");
    await assertTouchTarget(overflowCell, "Trailing library cell");
}

/** Open an app context menu: a real right-click, as on the other home specs. */
async function openAppMenu(page: Page) {
    await page.locator(HOME).locator(
        ".launcher-tile:not([data-folder-id]) .webapp-icon",
    ).first().click({ button: "right" });
}

async function runTouchInteractions(
    page: Page,
    cdp: CDPSession,
    fixtures: Fixtures,
    theme: Theme,
    evidence: string,
) {
    const grid = page.locator(HOME);
    const apps = grid.locator(
        ".launcher-tile:not([data-folder-id]) .webapp-icon",
    );

    // Arrange via the app context menu; menu targets stay touch sized.
    await openAppMenu(page);
    const arrangeItem = page.getByRole("menuitem", {
        name: "整理布局",
        exact: true,
    });
    await arrangeItem.waitFor({ state: "visible" });
    await settlePresentation(page);
    await assertTouchTarget(arrangeItem, "Arrange-layout menu item");
    await arrangeItem.click();
    await page.waitForFunction(
        (selector) => {
            const tiles = document.querySelectorAll(
                `${selector} > .launcher-tile[data-tile-id]`,
            );
            return tiles.length > 0 &&
                document.querySelectorAll(
                        `${selector} > .launcher-tile.is-managing`,
                    ).length === tiles.length;
        },
        HOME,
    );
    assertEquals(
        await grid.locator("[data-library-cell='add']").count(),
        0,
        "Arranging hides the add cell",
    );
    await assertTouchTarget(apps.first(), "App target while arranging");
    await assertTouchTarget(
        grid.locator(
            ".launcher-folder-item--small .launcher-folder-background",
        ),
        "Small folder target while arranging",
    );
    await assertTouchTarget(
        grid.locator(
            ".launcher-folder-item--large .launcher-folder-background",
        ),
        "Large folder target while arranging",
        "bottom-edge",
    );

    // The portaled drag preview of a large folder keeps its 2x2 footprint and
    // follows the pointer from the source tile.
    const largeOpener = grid.locator(
        ".launcher-folder-item--large .launcher-folder-background",
    );
    await largeOpener.scrollIntoViewIfNeeded();
    const largeBox = (await largeOpener.boundingBox())!;
    const sourceBox = (await grid.locator(
        `:scope > .launcher-tile[data-folder-id="${fixtures.largeGroupId}"]`,
    ).boundingBox())!;
    const start = {
        x: largeBox.x + largeBox.width / 2,
        y: largeBox.y + largeBox.height - 6,
        id: 1,
    };
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [start],
    });
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...start, x: start.x + 12, y: start.y - 12 }],
    });
    const overlay = page.locator(".launcher-overlay--large");
    await overlay.waitFor();
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...start, x: start.x + 24, y: start.y - 24 }],
    });
    await page.waitForFunction(({ x, y }) => {
        const r = document.querySelector(".launcher-overlay--large")
            ?.getBoundingClientRect();
        return r && Math.abs(r.x - x) < 1 && Math.abs(r.y - y) < 1;
    }, { x: sourceBox.x + 24, y: sourceBox.y - 24 });
    const overlayBox = (await overlay.boundingBox())!;
    assertNear(overlayBox.width, 2 * 68 + 4, "Large-folder overlay width");
    assertNear(overlayBox.height, 2 * 68 + 4, "Large-folder overlay height");
    assertNear(overlayBox.x, sourceBox.x + 24, "Overlay horizontal alignment");
    assertNear(overlayBox.y, sourceBox.y - 24, "Overlay vertical alignment");
    await settlePresentation(page);
    await page.screenshot({ path: `${evidence}/arrange-${theme}-390x844.png` });
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
    });
    await overlay.waitFor({ state: "detached" });

    await openAppMenu(page);
    const finishItem = page.getByRole("menuitem", {
        name: "完成整理",
        exact: true,
    });
    await finishItem.waitFor({ state: "visible" });
    await settlePresentation(page);
    await assertTouchTarget(finishItem, "Finish-arranging menu item");
    await finishItem.click();
    await page.waitForFunction(
        (selector) =>
            document.querySelectorAll(`${selector} .is-managing`).length === 0,
        HOME,
    );

    // Folders open in a popup whose grid shares the home tracks and glyphs.
    for (
        const folder of [
            {
                id: fixtures.smallGroupId,
                name: "small",
                expectedApps: fixtures.smallFolderAppCount,
            },
            {
                id: fixtures.largeGroupId,
                name: "large",
                expectedApps: fixtures.largeFolderAppCount,
            },
        ]
    ) {
        const background = grid.locator(
            `:scope > .launcher-tile[data-folder-id="${folder.id}"] .launcher-folder-background`,
        );
        if (folder.name === "large") {
            const box = (await background.boundingBox())!;
            await background.click({
                position: { x: box.width / 2, y: box.height - 5 },
            });
        } else {
            await background.click();
        }
        const popup = page.locator(".launcher-popup");
        await popup.waitFor({ state: "visible" });
        await settlePresentation(page);
        const popupGrid = popup.locator(".launcher-grid--popup");
        const geometry = await popupGrid.evaluate((node) => {
            const style = getComputedStyle(node);
            const glyph = node.querySelector(".webapp-glyph")!
                .getBoundingClientRect();
            return {
                cell: parseFloat(style.getPropertyValue("--launcher-col-w")),
                gapX: parseFloat(style.columnGap),
                gapY: parseFloat(style.rowGap),
                glyph: [glyph.width, glyph.height],
                overflow: node.scrollWidth > node.clientWidth + 1,
            };
        });
        assertEquals(geometry, {
            cell: 68,
            gapX: 4,
            gapY: 4,
            glyph: [44, 44],
            overflow: false,
        });
        const members = popupGrid.locator(".webapp-icon");
        assertEquals(
            await members.count(),
            folder.expectedApps,
            `${folder.name} folder popup app count`,
        );
        for (let index = 0; index < folder.expectedApps; index++) {
            await assertTouchTarget(
                members.nth(index),
                `${folder.name} folder popup app ${index + 1}`,
            );
        }
        await page.screenshot({
            path: `${evidence}/popup-${theme}-${folder.name}-folder.png`,
        });
        await page.keyboard.press("Escape");
        await popup.waitFor({ state: "detached" });
    }

    // 更多（N） opens every tile that did not fit, plus the add entry.
    const more = grid.locator("[data-library-cell='more']");
    const moreCount = Number(
        /（(\d+)）/.exec((await more.getAttribute("aria-label"))!)![1],
    );
    const morePopup = await openMoreApps(page, more);
    await settlePresentation(page);
    assertEquals(
        await morePopup.locator(
            ".launcher-grid--popup > .launcher-tile[data-tile-id]",
        )
            .count(),
        moreCount,
        "更多 popup shows exactly the tiles that did not fit",
    );
    await assertTouchTarget(
        morePopup.locator("[data-library-cell='add']"),
        "Add cell inside 更多",
    );
    await page.keyboard.press("Escape");
    await morePopup.waitFor({ state: "detached" });
}

async function runTouchMatrix(
    browser: Browser,
    origin: string,
    evidence: string,
) {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        colorScheme: "light",
    });
    try {
        const page = await context.newPage();
        await register(page, origin, "apps_density_touch");
        const fixtures = await seedFixtures(page);
        const cdp = await context.newCDPSession(page);
        for (const theme of THEMES) {
            await setTheme(page, theme);
            for (const viewport of TOUCH_VIEWPORTS) {
                await page.setViewportSize(viewport);
                await page.reload();
                await waitForHome(page, viewport.width, theme);
                assertEquals(
                    await page.evaluate(() => ({
                        coarse: matchMedia("(pointer: coarse)").matches,
                        noHover: matchMedia("(hover: none)").matches,
                    })),
                    { coarse: true, noHover: true },
                    "Touch matrix requires a coarse, hover-less pointer",
                );
                const metrics = await collectMetrics(page, fixtures);
                assertDensity(metrics, viewport, true, fixtures.rootTileCount);
                assertEquals(
                    metrics.tiles.filter((tile) => tile.id !== null).length >=
                        1,
                    true,
                );
                assertFolderPreviews(metrics, true);
                await assertHomeHitTargets(page);
                assertEquals(
                    await page.evaluate(() =>
                        document.documentElement.scrollWidth > innerWidth
                    ),
                    false,
                    "Home must not scroll horizontally",
                );
                await page.screenshot({
                    path:
                        `${evidence}/touch-${theme}-${viewport.width}x${viewport.height}.png`,
                });
                if (viewport.width === 390 && viewport.height === 844) {
                    await runTouchInteractions(
                        page,
                        cdp,
                        fixtures,
                        theme,
                        evidence,
                    );
                }
            }
        }

        // Resizing reflows the live grid without a reload.
        for (const width of [390, 375, 430, 767, 768]) {
            await page.setViewportSize({ width, height: 844 });
            await waitForHome(page, width);
            assertDensity(
                await collectMetrics(page, fixtures),
                { width, height: 844 },
                true,
                fixtures.rootTileCount,
            );
        }
    } finally {
        await context.close();
    }
}

async function runDesktopMatrix(
    browser: Browser,
    origin: string,
    evidence: string,
) {
    const context: BrowserContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: "light",
    });
    try {
        const page = await context.newPage();
        await register(page, origin, "apps_density_desktop");
        const fixtures = await seedFixtures(page);
        for (const theme of THEMES) {
            await setTheme(page, theme);
            for (
                const viewport of [
                    { width: 1440, height: 900 },
                    { width: 1366, height: 768 },
                ]
            ) {
                await page.setViewportSize(viewport);
                await page.reload();
                await waitForHome(page, viewport.width, theme);
                assertEquals(
                    await page.evaluate(() => ({
                        fine: matchMedia("(pointer: fine)").matches,
                        hover: matchMedia("(hover: hover)").matches,
                    })),
                    { fine: true, hover: true },
                    "Desktop must emulate a fine, hovering pointer",
                );
                const metrics = await collectMetrics(page, fixtures);
                assertDensity(metrics, viewport, false, fixtures.rootTileCount);
                assertFolderPreviews(metrics, false);
                if (viewport.height === 768) {
                    assert(
                        metrics.rowTracks.length <= 3,
                        `Short desktop viewports show three rows or fewer: ${metrics.rowTracks.length}`,
                    );
                }
                await page.screenshot({
                    path:
                        `${evidence}/desktop-${theme}-${viewport.width}x${viewport.height}.png`,
                });
            }
        }
    } finally {
        await context.close();
    }
}

// Large folders with 1, 2 and 4 members keep their previews inside the surface
// and clear of the title, with touch-sized buttons.
async function runSparseLargePreviews(
    browser: Browser,
    origin: string,
    evidence: string,
) {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        colorScheme: "light",
    });
    try {
        const page = await context.newPage();
        await register(page, origin, "apps_density_sparse");
        const variants = await page.evaluate(async () => {
            const ids: Array<{ id: string; count: number }> = [];
            for (const count of [1, 2, 4]) {
                const response = await fetch("/api/webapp-groups", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: `预览 ${count} 个应用的长名称文件夹`,
                        folderSize: "large",
                        sortOrder: count,
                    }),
                });
                if (!response.ok) throw Error(await response.text());
                const { data: group } = await response.json();
                for (let i = 0; i < count; i++) {
                    const result = await fetch("/api/webapps", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name: `预览 ${count}-${i} 长名称`,
                            url: `https://preview-${count}-${i}.example/`,
                            groupId: group.id,
                        }),
                    });
                    if (!result.ok) throw Error(await result.text());
                }
                ids.push({ id: group.id, count });
            }
            return ids;
        });
        await page.reload();
        await waitForHome(page, 390);
        for (const { id, count } of variants) {
            const tile = page.locator(
                `${HOME} > .launcher-tile[data-folder-id="${id}"]`,
            );
            const buttons = tile.locator("button.launcher-folder-mini");
            assertEquals(await buttons.count(), count);
            await assertTouchTarget(
                tile.locator(".launcher-folder-background"),
                "Sparse large folder opener",
                "bottom-edge",
            );
            for (let index = 0; index < count; index++) {
                await assertTouchTarget(
                    buttons.nth(index),
                    "Sparse large folder preview",
                );
            }
            const inside = await tile.evaluate((tile) => {
                const surface = tile.querySelector(".launcher-folder-surface")!
                    .getBoundingClientRect();
                const title = tile.querySelector(".launcher-folder-name")!
                    .getBoundingClientRect();
                return Array.from(
                    tile.querySelectorAll(".launcher-folder-mini-glyph"),
                    (glyph) => {
                        const r = glyph.getBoundingClientRect();
                        return r.left >= surface.left &&
                            r.right <= surface.right &&
                            r.top >= surface.top &&
                            r.bottom <= surface.bottom && r.bottom <= title.top;
                    },
                );
            });
            assertEquals(
                inside,
                Array(count).fill(true),
                "Sparse preview glyphs stay inside the surface and clear of the title",
            );
        }
        await page.screenshot({
            path: `${evidence}/large-preview-variants-390.png`,
        });
    } finally {
        await context.close();
    }
}

Deno.test("home library density geometry and hit targets #149 #244", async () => {
    const evidence = await createEvidenceDirectory("apps-density");
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        await runTouchMatrix(browser, app.origin, evidence);
        await runDesktopMatrix(browser, app.origin, evidence);
        await runSparseLargePreviews(browser, app.origin, evidence);
    } finally {
        await browser.close();
        await app.close();
    }
});
