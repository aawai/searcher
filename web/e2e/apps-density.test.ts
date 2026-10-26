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
import { closeLibrary } from "./helpers/library.ts";
import { assertLargeFolderGeometry } from "./helpers/launcher-geometry.ts";

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
    platePadding: number;
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
    dockBottom: number;
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
const HOME_MAX_ROWS = 4;

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

/** Documented tracks: standard 76/12 desktop, 64/6 mobile; touch 80/8, 68/4. */
function expectedGeometry(viewport: Viewport, coarse: boolean): Geometry {
    const wide = viewport.width >= 768;
    if (coarse) {
        return wide
            ? { cell: 80, gap: 8, glyph: 48 }
            : { cell: 68, gap: 4, glyph: 44 };
    }
    return wide
        ? { cell: 76, gap: 12, glyph: 48 }
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
                isHomeFixed: true,
            });

        // Folders lead the canonical order so both stay on the first rows of
        // every viewport; the loose apps overflow into 更多（N）.
        const smallGroup = await post<{ id: string }>("/api/webapp-groups", {
            name: "Small Sparse Folder",
            sortOrder: 0,
            folderSize: "small",
            isHomeFixed: true,
        });
        const largeGroup = await post<{ id: string }>("/api/webapp-groups", {
            name: "Large Full Folder",
            sortOrder: 1,
            folderSize: "large",
            isHomeFixed: true,
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
 * measured plate content width (ResizeObserver), tiles are laid out and the
 * viewport has the requested width.
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
        const parentStyle = getComputedStyle(parent);
        const cell = Number.parseFloat(
            style.getPropertyValue("--launcher-col-w"),
        );
        const gap = Number.parseFloat(style.columnGap);
        // The plate's padding is outside its content box; columns derive from
        // the content width. This fixture contains a large folder, so the
        // capacity is not narrowed by last-row balancing.
        const available = parent.clientWidth -
            (Number.parseFloat(parentStyle.paddingLeft) || 0) -
            (Number.parseFloat(parentStyle.paddingRight) || 0);
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
        const rowHeight = px(gridStyle.getPropertyValue("--launcher-row-h"));
        const rowGap = px(gridStyle.rowGap);
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
            rowHeight,
            columnGap,
            rowGap,
            platePadding: px(containerStyle.paddingBottom),
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
            dockBottom: Math.max(
                0,
                px(
                    getComputedStyle(document.documentElement)
                        .getPropertyValue("--dock-inset-bottom"),
                ),
            ),
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
        metrics.rowTracks.length >= 1 &&
            metrics.rowTracks.length <= HOME_MAX_ROWS,
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

    // The plate keeps 48px clear of the viewport bottom. N rows are
    // N * (row height + row gap) - gap tall (no gap after the last row), so
    // while the plan holds fewer than the four-row maximum, one more row
    // (row height + gap) below the last row plus the plate's bottom padding
    // must not fit.
    const viewportHeight = viewport.height;
    const plateBottom = metrics.grid.bottom + metrics.platePadding;
    const clearance = Math.max(
        BOTTOM_CLEARANCE,
        metrics.dockBottom + metrics.rowGap,
    );
    assert(
        plateBottom <= viewportHeight - clearance + 0.75,
        `Plate bottom ${plateBottom} must keep ${clearance}px clear of the ${viewportHeight}px viewport`,
    );
    if (metrics.rowTracks.length < HOME_MAX_ROWS) {
        assert(
            plateBottom + metrics.rowHeight + metrics.rowGap >
                viewportHeight - clearance - 0.75,
            `Another row would still fit: plate bottom ${plateBottom}, viewport ${viewportHeight}`,
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

function assertFolderPreviews(metrics: Metrics, _coarse: boolean) {
    const small = metrics.folders.find((folder) => folder.size === "small");
    const large = metrics.folders.find((folder) => folder.size === "large");
    assert(small && large, "Both folders must be rendered on the home grid");
    assertEquals(small.previewCount, 2, "Small folder 2x2 preview count");
    assertEquals(
        small.previewButtonCount,
        0,
        "Small folder preview glyphs are not interactive",
    );
    // All pointer types share nine slots: eight apps and a remainder for 10 members.
    const clickable = 8;
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

async function assertHomeHitTargets(page: Page, rootTileCount: number) {
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
    // The add cell only fills an empty home grid. Beside tiles the grid either
    // overflows into exactly one 更多（N） cell or ends with its last tile.
    assertEquals(
        await grid.locator("[data-library-cell='add']").count(),
        0,
        "A home grid with tiles shows no add cell",
    );
    const moreCell = grid.locator("[data-library-cell='more']");
    const moreCount = await moreCell.count();
    assert(moreCount <= 1, `At most one 更多 cell, got ${moreCount}`);
    if (moreCount === 1) {
        await assertTouchTarget(moreCell, "更多（N） cell");
        return;
    }
    assertEquals(
        await grid.locator(":scope > .launcher-tile[data-tile-id]").count(),
        rootTileCount,
        "Without overflow every root tile sits on the grid",
    );
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
        "Arranging keeps the empty-state add cell off the tiled home grid",
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

    // 更多（N） opens the complete library app view, with its add action.
    const more = grid.locator("[data-library-cell='more']");
    const moreCount = Number(
        /（(\d+)）/.exec((await more.getAttribute("aria-label"))!)![1],
    );
    const library = await openMoreApps(page, more);
    await settlePresentation(page);
    const libraryTiles = await library.locator(
        "[data-library-apps-grid] > :is(.launcher-app, .launcher-folder-item)",
    ).count();
    assert(
        libraryTiles >= moreCount,
        `library shows every tile (${libraryTiles} >= ${moreCount})`,
    );
    assertEquals(
        await page.locator("[data-library]").getByRole("button", {
            name: "添加应用",
            exact: true,
        }).count() >= 1,
        true,
        "library keeps the add action",
    );
    await closeLibrary(page);
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
                await assertHomeHitTargets(page, fixtures.rootTileCount);
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
                    // With the 68px bottom dock active, 1366x768 reserves 80px bottom
                    // clearance (768 - 355.84 - 80 - 16 = 316.16px) and fits three 76px rows.
                    assertEquals(
                        metrics.rowTracks.length,
                        3,
                        `1366x768 fits three rows above the bottom dock: ${metrics.rowTracks.length}`,
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

// Each member-count variant runs with both pointer types at both target widths.
async function runSparseLargePreviews(
    browser: Browser,
    origin: string,
    evidence: string,
) {
    for (const width of [390, 1440]) {
        for (const coarse of [false, true]) {
            const context = await browser.newContext({
                viewport: { width, height: width === 390 ? 844 : 900 },
                hasTouch: coarse,
                isMobile: coarse && width === 390,
            });
            try {
                const page = await context.newPage();
                await register(page, origin, `folder_${width}_${coarse}`);
                const smallResponse = await context.request.post(
                    `${origin}/api/webapp-groups`,
                    {
                        headers: { Origin: origin },
                        data: {
                            name: "小文件夹",
                            folderSize: "small",
                            sortOrder: 1,
                            isHomeFixed: true,
                        },
                    },
                );
                assertEquals(smallResponse.status(), 200);
                const { data: smallGroup } = await smallResponse.json();
                for (let index = 0; index < 5; index++) {
                    const response = await context.request.post(
                        `${origin}/api/webapps`,
                        {
                            headers: { Origin: origin },
                            data: {
                                name: `邻居 ${index}`,
                                url: `https://neighbor-${index}.example/`,
                                iconSource: "default",
                                sortOrder: index + 10,
                                isHomeFixed: true,
                            },
                        },
                    );
                    assertEquals(response.status(), 200);
                }
                for (const count of [0, 1, 4, 9, 12]) {
                    const created = await context.request.post(
                        `${origin}/api/webapp-groups`,
                        {
                            headers: { Origin: origin },
                            data: {
                                name: `预览 ${count}`,
                                folderSize: "large",
                                sortOrder: 0,
                                isHomeFixed: true,
                            },
                        },
                    );
                    assertEquals(created.status(), 200);
                    const { data: group } = await created.json();
                    const members: string[] = [];
                    for (let index = 0; index < count; index++) {
                        const response = await context.request.post(
                            `${origin}/api/webapps`,
                            {
                                headers: { Origin: origin },
                                data: {
                                    name: `成员 ${index}`,
                                    url: `https://preview-${count}-${index}.example/`,
                                    iconSource: "default",
                                    groupId: group.id,
                                },
                            },
                        );
                        assertEquals(response.status(), 200);
                        members.push((await response.json()).data.id);
                    }
                    for (const labels of [true, false]) {
                        const pref = await context.request.patch(
                            `${origin}/api/preferences`,
                            {
                                headers: { Origin: origin },
                                data: { showAppLabels: labels },
                            },
                        );
                        assertEquals(pref.status(), 200);
                        await page.reload();
                        await waitForHome(page, width);
                        const tile = page.locator(
                            `${HOME} > .launcher-tile[data-folder-id="${group.id}"]`,
                        );
                        await assertLargeFolderGeometry(tile, labels);
                        const small = page.locator(
                            `${HOME} > .launcher-tile[data-folder-id="${smallGroup.id}"]`,
                        );
                        assertEquals(
                            await small.locator(".launcher-folder-name")
                                .count(),
                            labels ? 1 : 0,
                        );
                        assert(
                            (await small.locator(".launcher-folder-background")
                                .getAttribute("aria-label"))?.includes(
                                    "小文件夹",
                                ),
                        );
                        assertEquals(
                            await small.locator(".launcher-folder-item")
                                .getAttribute("title"),
                            "小文件夹",
                        );
                        assertEquals(
                            await tile.locator("button.launcher-folder-mini")
                                .count(),
                            Math.min(count, 9),
                        );
                        assertEquals(
                            await tile.locator(".launcher-folder-remainder")
                                .count(),
                            count > 9 ? 1 : 0,
                        );
                        const opener = tile.locator(
                            ".launcher-folder-background",
                        );
                        assert(
                            (await opener.getAttribute("aria-label"))?.includes(
                                `预览 ${count}`,
                            ),
                        );
                        assertEquals(
                            await tile.locator(".launcher-folder-item")
                                .getAttribute("title"),
                            `预览 ${count}`,
                        );
                        if (coarse) {
                            // Touch on any point of the surface, previews
                            // included, opens the folder.
                            const surface = tile.locator(
                                ".launcher-folder-surface",
                            );
                            await assertTouchTarget(
                                surface,
                                "Whole folder surface",
                            );
                            // The centre is a preview cell once there are 5+ members.
                            await surface.tap();
                            await page.locator(".launcher-popup").waitFor();
                            assertEquals(
                                await page.locator(
                                    ".launcher-popup .webapp-name",
                                ).count(),
                                labels ? count : 0,
                            );
                            await page.keyboard.press("Escape");
                            await page.locator(".launcher-popup").waitFor({
                                state: "detached",
                            });
                        }
                    }
                    await page.screenshot({
                        path:
                            `${evidence}/folder-${width}-${coarse}-${count}.png`,
                    });
                    for (const id of members) {
                        assertEquals(
                            (await context.request.delete(
                                `${origin}/api/webapps/${id}`,
                                { headers: { Origin: origin } },
                            )).status(),
                            200,
                        );
                    }
                    assertEquals(
                        (await context.request.delete(
                            `${origin}/api/webapp-groups/${group.id}`,
                            { headers: { Origin: origin } },
                        )).status(),
                        200,
                    );
                }
            } finally {
                await context.close();
            }
        }
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
