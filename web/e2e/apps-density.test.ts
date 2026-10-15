import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals } from "@std/assert";
import {
    type BrowserContext,
    type CDPSession,
    chromium,
    type Locator,
    type Page,
} from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

type Style = "zen" | "widgets";
type Theme = "light" | "dark";
type Viewport = { width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };
type TouchTargetMeasurement = {
    width: number;
    height: number;
    hit: boolean;
    point: { x: number; y: number };
    hitElement: string | null;
};

type DensityMetrics = {
    viewport: Viewport;
    availableWidth: number;
    contentBounds: { left: number; right: number };
    grid: Box & { scrollWidth: number; clientWidth: number };
    columns: number;
    formulaColumns: number;
    cellWidth: number;
    rowHeight: number;
    columnGap: number;
    rowGap: number;
    columnTracks: number[];
    rowTracks: number[];
    glyph: Box | null;
    tiles: Array<{ id: string | null; kind: string; box: Box }>;
    overlaps: string[];
    outOfBounds: string[];
    horizontalOverflow: boolean;
    folders: Array<{
        id: string;
        size: "small" | "large";
        box: Box;
        previewClass: string;
        previewCount: number;
        previewButtonCount: number;
        moreText: string;
        moreLabel: string;
    }>;
};

type AppFixtures = {
    a9AppId: string;
    smallGroupId: string;
    largeGroupId: string;
    rootTileCount: number;
    looseAppCount: number;
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
const STYLES: Style[] = ["zen", "widgets"];
const THEMES: Theme[] = ["light", "dark"];
const GRID_SELECTOR = ".apps-workspace-root .launcher-grid--workspace";

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

async function setPreferences(page: Page, style: Style, theme: Theme) {
    const response = await page.evaluate(async ({ style, theme }) => {
        const result = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style, theme }),
        });
        return { ok: result.ok, status: result.status };
    }, { style, theme });
    assertEquals(
        response.ok,
        true,
        `Could not set ${style}/${theme} preferences`,
    );
}

async function seedApps(page: Page): Promise<AppFixtures> {
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

        const smallGroup = await post<{ id: string }>("/api/webapp-groups", {
            name: "Small Sparse Folder",
            sortOrder: 3,
            folderSize: "small",
        });
        const largeGroup = await post<{ id: string }>("/api/webapp-groups", {
            name: "Large Full Folder",
            sortOrder: 8,
            folderSize: "large",
        });
        const createApp = (params: {
            name: string;
            url: string;
            sortOrder: number;
            groupId?: string;
            isPinned?: boolean;
        }) =>
            post<{ id: string }>("/api/webapps", {
                ...params,
                groupId: params.groupId ?? null,
                iconSource: "default",
                openMode: "global",
            });

        const looseNames = [
            "A9 Search",
            "Home Geometry",
            ...Array.from(
                { length: 18 },
                (_, index) => `Loose App ${String(index + 3).padStart(2, "0")}`,
            ),
        ];
        let a9AppId = "";
        for (const [index, name] of looseNames.entries()) {
            const app = await createApp({
                name,
                url: `https://loose-${index + 1}.example/`,
                sortOrder: index,
                isPinned: index < 2,
            });
            if (index === 0) a9AppId = app.id;
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
            a9AppId,
            smallGroupId: smallGroup.id,
            largeGroupId: largeGroup.id,
            rootTileCount: looseNames.length + 2,
            looseAppCount: looseNames.length,
            smallFolderAppCount: 2,
            largeFolderAppCount: 10,
        };
    });
}

async function registerAndSeed(
    page: Page,
    origin: string,
): Promise<AppFixtures> {
    await page.goto(origin + "/register");
    await page.locator("#auth-username").fill("apps_density_149");
    await page.locator("#auth-display-name").fill("Apps density tester");
    await page.locator("#auth-password").fill("Apps-density-password-149!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });
    return await seedApps(page);
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

async function openAppsWorkspace(page: Page) {
    await page.waitForLoadState("networkidle");
    if (await page.locator(GRID_SELECTOR).isVisible()) {
        await settlePresentation(page);
        return;
    }
    const triggers = page.locator(
        '.workspace-mobile-navigation button[data-workspace="apps"], .desktop-dock button[data-workspace="apps"], .zen-edge-trigger button[data-workspace="apps"], .zen-edge-btn[data-workspace="apps"], button[aria-label="应用工作区"]',
    );
    let opened = false;
    for (let index = 0; index < await triggers.count(); index++) {
        const trigger = triggers.nth(index);
        if (
            await trigger.isVisible() && await trigger.evaluate((button) => {
                const r = button.getBoundingClientRect();
                const hit = document.elementFromPoint(
                    r.x + r.width / 2,
                    r.y + r.height / 2,
                );
                return hit === button || Boolean(hit && button.contains(hit));
            })
        ) {
            await trigger.click();
            opened = true;
            break;
        }
    }
    assert(opened, "No visible Apps workspace navigation control was found");
    await page.locator(".apps-workspace-root").waitFor({ state: "visible" });
    await page.locator(GRID_SELECTOR).waitFor({ state: "visible" });
    await page.waitForFunction((selector) => {
        const grid = document.querySelector<HTMLElement>(selector);
        return grid?.dataset.columns !== undefined;
    }, GRID_SELECTOR);
    await settlePresentation(page);
}

async function collectDensityMetrics(
    page: Page,
    fixtures: AppFixtures,
): Promise<DensityMetrics> {
    return await page.evaluate((fixture) => {
        const grid = document.querySelector<HTMLElement>(
            ".apps-workspace-root .launcher-grid--workspace",
        );
        if (!grid?.parentElement) {
            throw new Error("Workspace app grid is missing");
        }
        const container = grid.parentElement;
        const gridStyle = getComputedStyle(grid);
        const containerStyle = getComputedStyle(container);
        const gridRect = grid.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const parsePx = (value: string) => Number.parseFloat(value) || 0;
        const contentLeft = containerRect.left +
            parsePx(containerStyle.borderLeftWidth) +
            parsePx(containerStyle.paddingLeft);
        const contentRight = containerRect.right -
            parsePx(containerStyle.borderRightWidth) -
            parsePx(containerStyle.paddingRight);
        const availableWidth = Math.max(0, contentRight - contentLeft);
        const cellWidth = parsePx(
            gridStyle.getPropertyValue("--launcher-col-w"),
        );
        const rowHeight = parsePx(
            gridStyle.getPropertyValue("--launcher-row-h"),
        );
        const columnGap = parsePx(gridStyle.columnGap);
        const rowGap = parsePx(gridStyle.rowGap);
        const formulaColumns = Math.max(
            2,
            Math.floor((availableWidth + columnGap) / (cellWidth + columnGap)),
        );
        const tiles = Array.from(
            grid.querySelectorAll<HTMLElement>(":scope > .launcher-tile"),
        ).map((tile) => {
            const rect = tile.getBoundingClientRect();
            return {
                id: tile.dataset.tileId ?? null,
                kind: tile.querySelector(".launcher-folder-item--large")
                    ? "large-folder"
                    : tile.querySelector(".launcher-folder-item--small")
                    ? "small-folder"
                    : "app",
                box: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                },
            };
        });
        const overlaps: string[] = [];
        for (let left = 0; left < tiles.length; left++) {
            const a = tiles[left];
            for (let right = left + 1; right < tiles.length; right++) {
                const b = tiles[right];
                const overlapWidth = Math.min(
                    a.box.x + a.box.width,
                    b.box.x + b.box.width,
                ) - Math.max(a.box.x, b.box.x);
                const overlapHeight = Math.min(
                    a.box.y + a.box.height,
                    b.box.y + b.box.height,
                ) - Math.max(a.box.y, b.box.y);
                if (overlapWidth > 0.75 && overlapHeight > 0.75) {
                    overlaps.push(`${a.id} overlaps ${b.id}`);
                }
            }
        }
        const outOfBounds = tiles.flatMap((tile) => {
            const result: string[] = [];
            if (tile.box.x < gridRect.left - 1) {
                result.push(`${tile.id} left of grid`);
            }
            if (tile.box.x + tile.box.width > gridRect.right + 1) {
                result.push(`${tile.id} right of grid`);
            }
            if (tile.box.y < gridRect.top - 1) {
                result.push(`${tile.id} above grid`);
            }
            return result;
        });
        const folders = [fixture.smallGroupId, fixture.largeGroupId].flatMap(
            (id) => {
                const tile = grid.querySelector<HTMLElement>(
                    `[data-folder-id="${id}"]`,
                );
                if (!tile) return [];
                const rect = tile.getBoundingClientRect();
                const preview = tile.querySelector<HTMLElement>(
                    ".launcher-folder-preview",
                );
                const kind = tile.querySelector(
                        ".launcher-folder-item--large",
                    )
                    ? "large" as const
                    : "small" as const;
                return [{
                    id,
                    size: kind,
                    box: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                    },
                    previewClass: preview?.className ?? "",
                    previewCount: preview?.querySelectorAll(
                        ".launcher-folder-mini",
                    ).length ?? 0,
                    previewButtonCount: preview?.querySelectorAll(
                        "button.launcher-folder-mini",
                    ).length ?? 0,
                    moreText: tile.querySelector(".launcher-folder-more")
                        ?.textContent?.trim() ?? "",
                    moreLabel: tile.querySelector(".launcher-folder-more")
                        ?.getAttribute("aria-label") ?? "",
                }];
            },
        );
        const glyph = grid.querySelector<HTMLElement>(
            ".launcher-tile:not([data-folder-id]) .webapp-glyph",
        );
        const glyphRect = glyph?.getBoundingClientRect();

        return {
            viewport: { width: innerWidth, height: innerHeight },
            availableWidth,
            contentBounds: { left: contentLeft, right: contentRight },
            grid: {
                x: gridRect.x,
                y: gridRect.y,
                width: gridRect.width,
                height: gridRect.height,
                scrollWidth: grid.scrollWidth,
                clientWidth: grid.clientWidth,
            },
            columns: Number(grid.dataset.columns),
            formulaColumns,
            cellWidth,
            rowHeight,
            columnGap,
            rowGap,
            glyph: glyphRect
                ? {
                    x: glyphRect.x,
                    y: glyphRect.y,
                    width: glyphRect.width,
                    height: glyphRect.height,
                }
                : null,
            tiles,
            overlaps,
            outOfBounds,
            horizontalOverflow: grid.scrollWidth > grid.clientWidth + 1,
            columnTracks: gridStyle.gridTemplateColumns.split(" ").map(
                Number.parseFloat,
            ),
            rowTracks: gridStyle.gridTemplateRows.split(" ").map(
                Number.parseFloat,
            ),
            folders,
        };
    }, fixtures);
}

function assertDensityMetrics(
    metrics: DensityMetrics,
    viewport: Viewport,
    glyphSize = 40,
) {
    assertNear(metrics.cellWidth, 68, "Workspace column track");
    assertNear(metrics.rowHeight, 68, "Workspace row track");
    assertNear(metrics.columnGap, 4, "Workspace column gap");
    assertNear(metrics.rowGap, 4, "Workspace row gap");
    assertEquals(
        metrics.columnTracks,
        Array(metrics.columns).fill(68),
        "Computed CSS column tracks",
    );
    assert(
        metrics.rowTracks.every((track) => track === 68),
        "Computed CSS row tracks",
    );
    assert(
        metrics.availableWidth > 0,
        "Measured workspace content width must be positive",
    );
    assertEquals(
        metrics.columns,
        metrics.formulaColumns,
        `Grid columns must use measured content width ${metrics.availableWidth}px`,
    );
    if (viewport.width === 390) {
        assertEquals(
            metrics.columns,
            5,
            `390px viewport should yield five columns from ${metrics.availableWidth}px of app-grid content`,
        );
    }
    assertEquals(metrics.tiles.length, 22, "Mixed root app/folder tile count");
    assertEquals(metrics.overlaps, [], "Workspace tiles must not overlap");
    assertEquals(
        metrics.outOfBounds,
        [],
        "Workspace tiles must remain within the grid",
    );
    assertEquals(
        metrics.horizontalOverflow,
        false,
        "Workspace grid must not overflow horizontally",
    );
    const firstRowY = Math.min(...metrics.tiles.map((tile) => tile.box.y));
    assertNear(
        firstRowY,
        metrics.grid.y,
        "Grid starts at its first row without top whitespace",
    );
    const pitch = metrics.rowHeight + metrics.rowGap;
    for (const tile of metrics.tiles) {
        const row = Math.round((tile.box.y - firstRowY) / pitch);
        assertNear(tile.box.y, firstRowY + row * pitch, "Measured row pitch");
        if (tile.kind !== "large-folder") {
            assertNear(tile.box.width, 68, "Ordinary tile actual width");
            assertNear(tile.box.height, 68, "Ordinary tile actual height");
        }
    }
    assert(metrics.glyph !== null, "Workspace must render an app glyph");
    assertNear(metrics.glyph.width, glyphSize, "Workspace app glyph width");
    assertNear(metrics.glyph.height, glyphSize, "Workspace app glyph height");

    const small = metrics.folders.find((folder) => folder.size === "small");
    const large = metrics.folders.find((folder) => folder.size === "large");
    assert(small, "Sparse small folder should be present in the mixed layout");
    assert(large, "Full large folder should be present in the mixed layout");
    assertNear(small.box.width, 68, "Small folder track width");
    assertNear(small.box.height, 68, "Small folder track height");
    assertNear(large.box.width, 140, "Large folder two-column span");
    assertNear(large.box.height, 140, "Large folder two-row span");
}

function assertFolderPreviewMetrics(metrics: DensityMetrics, coarse: boolean) {
    const small = metrics.folders.find((folder) => folder.size === "small");
    const large = metrics.folders.find((folder) => folder.size === "large");
    assert(
        small && large,
        "Both small and large folder previews must be rendered",
    );
    assertEquals(small.previewCount, 2, "Small folder sparse preview count");
    assertEquals(
        small.previewButtonCount,
        0,
        "Small preview glyphs must be noninteractive",
    );

    const expectedLargePreviewCount = coarse ? 4 : 9;
    assertEquals(
        large.previewCount,
        expectedLargePreviewCount,
        "Large folder preview must expose four touch actions or nine fine-pointer previews",
    );
    assertEquals(large.previewButtonCount, expectedLargePreviewCount);
    assertEquals(
        large.moreText,
        `+${10 - expectedLargePreviewCount}`,
        "Remaining full-folder apps must be represented by a count",
    );
    assertEquals(
        large.moreLabel,
        `另有 ${10 - expectedLargePreviewCount} 个应用`,
    );
}

async function assertTouchTarget(
    locator: Locator,
    label: string,
    anchor: "center" | "bottom-center" = "center",
): Promise<TouchTargetMeasurement> {
    await locator.scrollIntoViewIfNeeded();
    const measurement = await locator.evaluate((node, position) => {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        const point = {
            x: rect.left + rect.width / 2,
            y: position === "bottom-center"
                ? rect.bottom - 22
                : rect.top + rect.height / 2,
        };
        const offsets = position === "bottom-center"
            ? [[0, 0], [-21, -21], [21, -21], [-21, 21], [21, 21]]
            : [[0, 0]];
        const hits = offsets.map(([x, y]) =>
            document.elementFromPoint(point.x + x, point.y + y)
        );
        const hit = hits[0];
        return {
            width: rect.width,
            height: rect.height,
            hit: hits.every((hit) =>
                hit === element || Boolean(hit && element.contains(hit))
            ),
            point,
            hitElement: hit?.tagName.toLowerCase() ?? null,
            owner: element.closest(".launcher-grid")?.className,
            coarse: matchMedia("(pointer: coarse)").matches,
            noHover: matchMedia("(hover: none)").matches,
            minWidth: getComputedStyle(element).minWidth,
            parentPosition: getComputedStyle(element.parentElement!).position,
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
    return measurement;
}

async function assertWorkspaceHitTargets(
    page: Page,
    coarse: boolean,
): Promise<Record<string, unknown>> {
    const root = page.locator(".apps-workspace-root");
    const measurements: Record<string, unknown> = {};
    measurements.app = await assertTouchTarget(
        root.locator(".launcher-grid--workspace .webapp-icon").first(),
        "Workspace app",
    );
    measurements.smallFolder = await assertTouchTarget(
        root.locator(
            ".launcher-grid--workspace .launcher-folder-item--small .launcher-folder-background",
        ),
        "Small folder opener",
    );
    const largeBackground = root.locator(
        ".launcher-grid--workspace .launcher-folder-item--large .launcher-folder-background",
    );
    measurements.largeFolder = await assertTouchTarget(
        largeBackground,
        "Large folder opener strip",
        "bottom-center",
    );
    const previewButtons = root.locator(
        ".launcher-grid--workspace .launcher-folder-item--large button.launcher-folder-mini",
    );
    const expectedCount = coarse ? 4 : 9;
    assertEquals(await previewButtons.count(), expectedCount);
    if (coarse) {
        measurements.largeFolderPreviewButtons = [];
        for (let index = 0; index < expectedCount; index++) {
            (measurements.largeFolderPreviewButtons as TouchTargetMeasurement[])
                .push(
                    await assertTouchTarget(
                        previewButtons.nth(index),
                        `Large folder preview app ${index + 1}`,
                    ),
                );
        }
    }
    return measurements;
}

async function runTouchInteractions(
    page: Page,
    cdp: CDPSession,
    fixtures: AppFixtures,
    style: Style,
    theme: Theme,
    report: {
        evidenceDirectory: string;
        screenshots: string[];
        interactions: Record<string, unknown>[];
    },
) {
    const root = page.locator(".apps-workspace-root");
    const search = root.getByRole("searchbox", {
        name: "搜索应用",
        exact: true,
    });
    await search.fill("A9");
    const a9Rows = root.locator(
        `.apps-search-row[data-app-id="${fixtures.a9AppId}"]`,
    );
    await a9Rows.waitFor({ state: "visible" });
    assertEquals(
        await root.locator(".apps-search-row").count(),
        1,
        "A9 search result count",
    );
    assertEquals(
        await a9Rows.count(),
        1,
        "A9 app must remain searchable by its real API-seeded name",
    );
    await search.fill("");

    const more = root.getByRole("button", {
        name: "应用更多操作",
        exact: true,
    });
    const management = await assertTouchTarget(
        more,
        "Apps management menu control",
    );
    await more.click();
    const menu = page.getByRole("menu", { name: "应用更多操作", exact: true });
    await menu.waitFor({ state: "visible" });
    const createFolderItem = menu.getByRole("menuitem", {
        name: "新建文件夹",
        exact: true,
    });
    const arrangeItem = menu.getByRole("menuitem", {
        name: "整理布局",
        exact: true,
    });
    const menuTargets = [
        await assertTouchTarget(
            createFolderItem,
            "Create-folder management action",
        ),
        await assertTouchTarget(
            arrangeItem,
            "Arrange-layout management action",
        ),
    ];
    await arrangeItem.click();
    assertEquals(
        await root.locator(".launcher-tile.is-managing").count(),
        fixtures.rootTileCount,
        "Arrange mode should expose every mixed root tile",
    );
    const arrangingApp = await assertTouchTarget(
        root.locator(".launcher-grid--workspace .webapp-icon").first(),
        "App target while arranging",
    );
    await assertTouchTarget(
        root.locator(
            ".launcher-grid--workspace .launcher-folder-item--small .launcher-folder-background",
        ),
        "Small folder target while arranging",
    );
    await assertTouchTarget(
        root.locator(
            ".launcher-grid--workspace .launcher-folder-item--large .launcher-folder-background",
        ),
        "Large folder target while arranging",
        "bottom-center",
    );
    const largeOpener = root.locator(
        ".launcher-folder-item--large .launcher-folder-background",
    );
    await largeOpener.scrollIntoViewIfNeeded();
    const largeBox = (await largeOpener.boundingBox())!;
    const start = {
        x: largeBox.x + largeBox.width / 2,
        y: largeBox.y + largeBox.height - 22,
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
    }, { x: largeBox.x + 24, y: largeBox.y - 24 });
    const overlayBox = (await overlay.boundingBox())!;
    assertNear(overlayBox.width, 140, "Large-folder touch overlay width");
    assertNear(overlayBox.height, 140, "Large-folder touch overlay height");
    assertNear(
        overlayBox.x,
        largeBox.x + 24,
        "Large-folder overlay horizontal alignment",
    );
    assertNear(
        overlayBox.y,
        largeBox.y - 24,
        "Large-folder overlay vertical alignment",
    );
    await settlePresentation(page);
    const arrangeScreenshot =
        `${report.evidenceDirectory}/arrange-${style}-${theme}-390x844.png`;
    await page.screenshot({ path: arrangeScreenshot });
    report.screenshots.push(arrangeScreenshot);
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
    });
    await overlay.waitFor({ state: "detached" });
    await more.click();
    const finishItem = page.getByRole("menuitem", {
        name: "完成整理",
        exact: true,
    });
    const finishTarget = await assertTouchTarget(
        finishItem,
        "Finish-arranging management action",
    );
    await finishItem.click();
    assertEquals(await root.locator(".launcher-tile.is-managing").count(), 0);

    const folderDetails: Record<string, number> = {};
    const screenshots: string[] = [];
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
        const background = root.locator(
            `.launcher-tile[data-folder-id="${folder.id}"] .launcher-folder-background`,
        );
        await background.scrollIntoViewIfNeeded();
        if (folder.name === "large") {
            const box = await background.boundingBox();
            assert(box, "Large folder opener should have a measurable box");
            await background.click({
                position: { x: box.width / 2, y: box.height - 5 },
            });
        } else {
            await background.click();
        }
        const detail = root.locator(".launcher-folder-inline");
        await detail.waitFor({ state: "visible" });
        const appButtons = detail.locator(
            ".launcher-folder-contents .webapp-icon",
        );
        await settlePresentation(page);
        const detailGeometry = await detail.locator(".launcher-folder-contents")
            .evaluate((grid) => {
                const style = getComputedStyle(grid);
                const glyph = grid.querySelector(".webapp-glyph")!
                    .getBoundingClientRect();
                return {
                    track: parseFloat(style.gridAutoRows),
                    gapX: parseFloat(style.columnGap),
                    gapY: parseFloat(style.rowGap),
                    glyph: [glyph.width, glyph.height],
                    overflow: grid.scrollWidth > grid.clientWidth + 1,
                };
            });
        assertEquals(detailGeometry, {
            track: 68,
            gapX: 4,
            gapY: 4,
            glyph: [40, 40],
            overflow: false,
        });
        assertEquals(
            await appButtons.count(),
            folder.expectedApps,
            `${folder.name} folder detail app count`,
        );
        const detailTargets: TouchTargetMeasurement[] = [];
        for (let index = 0; index < folder.expectedApps; index++) {
            detailTargets.push(
                await assertTouchTarget(
                    appButtons.nth(index),
                    `${folder.name} folder detail app ${index + 1}`,
                ),
            );
        }
        folderDetails[folder.name] = await appButtons.count();
        const screenshot =
            `${report.evidenceDirectory}/detail-${style}-${theme}-${folder.name}-folder.png`;
        await page.screenshot({ path: screenshot });
        report.screenshots.push(screenshot);
        screenshots.push(screenshot);
        await root.getByRole("button", { name: "返回应用列表", exact: true })
            .click();
        await page.locator(GRID_SELECTOR).waitFor({ state: "visible" });
    }

    const managementScreenshot =
        `${report.evidenceDirectory}/management-${style}-${theme}-390x844.png`;
    await page.screenshot({ path: managementScreenshot });
    report.screenshots.push(managementScreenshot);
    report.interactions.push({
        viewport: { width: 390, height: 844 },
        style,
        theme,
        a9SearchResults: await root.locator(".apps-search-row").count(),
        management,
        menuTargets,
        arrangingApp,
        finishTarget,
        folderDetails,
        detailTargetsPerFolder: fixtures.largeFolderAppCount,
        screenshots,
        managementScreenshot,
    });
}

async function collectHomeGeometry(page: Page, selector: string) {
    return await page.evaluate((selector) => {
        const grid = document.querySelector<HTMLElement>(selector);
        if (!grid) throw new Error(`Expected home launcher ${selector}`);
        const style = getComputedStyle(grid);
        const rect = grid.getBoundingClientRect();
        const boxes = (nodes: NodeListOf<Element>) =>
            Array.from(nodes, (node) => {
                const r = node.getBoundingClientRect();
                return {
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                };
            });
        return {
            selector,
            presentation: grid.dataset.presentation ?? "default",
            cellWidth:
                Number.parseFloat(style.getPropertyValue("--launcher-col-w")) ||
                0,
            rowHeight:
                Number.parseFloat(style.getPropertyValue("--launcher-row-h")) ||
                0,
            columnGap: Number.parseFloat(style.columnGap) || 0,
            rowGap: Number.parseFloat(style.rowGap) || 0,
            grid: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            },
            tiles: boxes(grid.querySelectorAll(":scope > .launcher-tile")),
            glyphs: boxes(grid.querySelectorAll(".webapp-glyph")),
        };
    }, selector);
}

async function runDesktopMatrix(
    page: Page,
    fixtures: AppFixtures,
    report: {
        evidenceDirectory: string;
        screenshots: string[];
        desktop: Record<string, unknown>[];
        homeQuick: Record<string, unknown>[];
    },
) {
    for (const style of STYLES) {
        for (const theme of THEMES) {
            await page.setViewportSize({ width: 1440, height: 900 });
            await setPreferences(page, style, theme);
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            await page.waitForFunction(
                ({ style, theme }) =>
                    document.documentElement.dataset.theme === theme &&
                    document.querySelector(`main.home-${style}`) !== null,
                { style, theme },
            );
            const media = await page.evaluate(() => ({
                fine: matchMedia("(pointer: fine)").matches,
                hover: matchMedia("(hover: hover)").matches,
                theme: document.documentElement.getAttribute("data-theme"),
            }));
            assertEquals(
                media.fine,
                true,
                "Desktop must emulate a fine pointer",
            );
            assertEquals(
                media.hover,
                true,
                "Desktop must emulate hover support",
            );
            assertEquals(media.theme, theme);

            const homeSelector = style === "widgets"
                ? ".launcher-grid--quick"
                : ".pinned-area .launcher-grid--home";
            const homeGrid = page.locator(homeSelector).first();
            await homeGrid.waitFor({ state: "visible" });
            const homeBefore = await collectHomeGeometry(page, homeSelector);
            assertNear(
                homeBefore.cellWidth,
                64,
                `${style} Home/Quick track width`,
            );
            assertNear(
                homeBefore.rowHeight,
                64,
                `${style} Home/Quick row height`,
            );
            assertNear(
                homeBefore.columnGap,
                style === "widgets" ? 8 : 6,
                `${style} Home/Quick column gap`,
            );
            assertNear(
                homeBefore.rowGap,
                style === "widgets" ? 8 : 6,
                `${style} Home/Quick row gap`,
            );

            await openAppsWorkspace(page);
            const metrics = await collectDensityMetrics(page, fixtures);
            const screenshot =
                `${report.evidenceDirectory}/desktop-${style}-${theme}-1440x900.png`;
            await page.screenshot({ path: screenshot });
            report.screenshots.push(screenshot);
            report.desktop.push({
                style,
                theme,
                pointer: media,
                metrics,
                screenshot,
            });
            assertDensityMetrics(metrics, { width: 1440, height: 900 }, 38);
            assertFolderPreviewMetrics(metrics, false);
            const homeAfter = await collectHomeGeometry(page, homeSelector);
            assertEquals(
                homeAfter,
                homeBefore,
                `${style} Home/Quick geometry must not change when the Apps workspace opens`,
            );
            report.homeQuick.push({
                style,
                theme,
                before: homeBefore,
                after: homeAfter,
            });
        }
    }
}

Deno.test("apps workspace touch density geometry and hit targets #149", async () => {
    const EVIDENCE_DIR = await createEvidenceDirectory("apps-density");
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    const report: {
        issue: number;
        evidenceDirectory: string;
        completed: boolean;
        error?: string;
        fixture?: AppFixtures;
        finishedAt?: string;
        screenshots: string[];
        touchMatrix: Record<string, unknown>[];
        desktop: Record<string, unknown>[];
        homeQuick: Record<string, unknown>[];
        interactions: Record<string, unknown>[];
    } = {
        issue: 149,
        evidenceDirectory: EVIDENCE_DIR,
        completed: false,
        screenshots: [],
        touchMatrix: [],
        desktop: [],
        homeQuick: [],
        interactions: [],
    };
    let touchContext: BrowserContext | undefined;
    let desktopContext: BrowserContext | undefined;

    try {
        touchContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 1,
            isMobile: true,
            hasTouch: true,
            colorScheme: "light",
        });
        const touchPage = await touchContext.newPage();
        const fixtures = await registerAndSeed(touchPage, app.origin);
        const cdp = await touchContext.newCDPSession(touchPage);
        report.fixture = fixtures;

        for (const style of STYLES) {
            for (const theme of THEMES) {
                await setPreferences(touchPage, style, theme);
                for (const viewport of TOUCH_VIEWPORTS) {
                    await touchPage.setViewportSize(viewport);
                    await touchPage.reload();
                    await touchPage.locator("main").waitFor({
                        state: "visible",
                    });
                    await touchPage.waitForFunction(
                        ({ style, theme }) =>
                            document.documentElement.dataset.theme === theme &&
                            document.querySelector(`main.home-${style}`) !==
                                null,
                        { style, theme },
                    );
                    const media = await touchPage.evaluate(() => ({
                        coarse: matchMedia("(pointer: coarse)").matches,
                        noHover: matchMedia("(hover: none)").matches,
                        theme: document.documentElement.getAttribute(
                            "data-theme",
                        ),
                    }));
                    assertEquals(
                        media.coarse,
                        true,
                        "Touch matrix requires a coarse pointer",
                    );
                    assertEquals(
                        media.noHover,
                        true,
                        "Touch matrix requires no-hover media",
                    );
                    assertEquals(media.theme, theme);
                    const homeSelector = style === "widgets"
                        ? ".launcher-grid--quick"
                        : ".pinned-area .launcher-grid--home";
                    await touchPage.locator(homeSelector).first().waitFor();
                    const home = await collectHomeGeometry(
                        touchPage,
                        homeSelector,
                    );
                    const compactHome = viewport.width < 768;
                    assertNear(
                        home.cellWidth,
                        compactHome ? 68 : 88,
                        "Mobile Home presenters share compact touch tracks",
                    );
                    assertNear(
                        home.rowHeight,
                        compactHome ? 68 : 88,
                        "Home touch row geometry",
                    );
                    assertNear(
                        home.columnGap,
                        compactHome ? 4 : style === "widgets" ? 8 : 6,
                        "Mobile Home presenters share compact gaps",
                    );
                    assertNear(
                        home.rowGap,
                        compactHome ? 4 : style === "widgets" ? 8 : 6,
                        "Home touch row gaps",
                    );
                    await openAppsWorkspace(touchPage);
                    const metrics = await collectDensityMetrics(
                        touchPage,
                        fixtures,
                    );
                    const screenshot =
                        `${EVIDENCE_DIR}/touch-${style}-${theme}-${viewport.width}x${viewport.height}.png`;
                    await touchPage.screenshot({
                        // Capture the actual viewport: fullPage temporarily resizes
                        // tall Widgets pages and can reset Chromium's touch media.
                        path: screenshot,
                    });
                    report.screenshots.push(screenshot);
                    report.touchMatrix.push({
                        style,
                        theme,
                        pointer: media,
                        metrics,
                        screenshot,
                    });

                    assertDensityMetrics(metrics, viewport);
                    assertFolderPreviewMetrics(metrics, true);
                    const targets = await assertWorkspaceHitTargets(
                        touchPage,
                        true,
                    );
                    const entry =
                        report.touchMatrix[report.touchMatrix.length - 1];
                    entry.targets = targets;
                    entry.home = home;
                    if (viewport.width === 390 && viewport.height === 640) {
                        const scroll = await touchPage.locator(
                            ".workspace-body",
                        ).evaluate((body) => {
                            body.scrollTop = body.scrollHeight;
                            const result = {
                                height: body.clientHeight,
                                contentHeight: body.scrollHeight,
                                moved: body.scrollTop,
                            };
                            body.scrollTop = 0;
                            return result;
                        });
                        assert(
                            scroll.contentHeight > scroll.height &&
                                scroll.moved > 0,
                            "Short-screen content must genuinely scroll",
                        );
                        entry.scroll = scroll;
                    }

                    if (viewport.width === 390 && viewport.height === 844) {
                        await runTouchInteractions(
                            touchPage,
                            cdp,
                            fixtures,
                            style,
                            theme,
                            report,
                        );
                    }
                }
            }
        }
        const orderBeforeResize =
            (await collectDensityMetrics(touchPage, fixtures)).tiles.map((
                tile,
            ) => tile.id);
        for (const width of [390, 375, 430, 767, 768]) {
            await touchPage.setViewportSize({ width, height: 844 });
            await touchPage.waitForFunction(() => {
                const grid = document.querySelector<HTMLElement>(
                    ".apps-workspace-root .launcher-grid--workspace",
                );
                if (!grid?.parentElement) return false;
                const style = getComputedStyle(grid);
                const parent = getComputedStyle(grid.parentElement);
                const available = grid.parentElement.clientWidth -
                    parseFloat(parent.paddingLeft) -
                    parseFloat(parent.paddingRight);
                const gap = parseFloat(style.columnGap);
                return Number(grid.dataset.columns) ===
                    Math.floor((available + gap) / (68 + gap));
            });
            const metrics = await collectDensityMetrics(touchPage, fixtures);
            assertDensityMetrics(metrics, { width, height: 844 });
            assertEquals(
                metrics.tiles.map((tile) => tile.id),
                orderBeforeResize,
                "Responsive reflow must preserve mixed order without a reload",
            );
            report.interactions.push({ resize: width, metrics });
        }

        const storageState = await touchContext.storageState();
        desktopContext = await browser.newContext({
            storageState,
            viewport: { width: 1440, height: 900 },
            deviceScaleFactor: 1,
            isMobile: false,
            hasTouch: false,
            colorScheme: "light",
        });
        const desktopPage = await desktopContext.newPage();
        await desktopPage.goto(app.origin + "/");
        await desktopPage.locator("main").waitFor({ state: "visible" });
        await runDesktopMatrix(desktopPage, fixtures, report);
        await touchPage.setViewportSize({ width: 390, height: 844 });
        const variants = await touchPage.evaluate(async () => {
            const ids: Array<{ id: string; count: number }> = [];
            for (const count of [1, 2, 4]) {
                const response = await fetch("/api/webapp-groups", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: `预览 ${count} 个应用的长名称文件夹`,
                        folderSize: "large",
                        sortOrder: -count,
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
        await touchPage.reload();
        await touchPage.locator("main.home-widgets").waitFor();
        await openAppsWorkspace(touchPage);
        for (const { id, count } of variants) {
            const tile = touchPage.locator(
                `.launcher-tile[data-folder-id="${id}"]`,
            );
            const buttons = tile.locator("button.launcher-folder-mini");
            assertEquals(await buttons.count(), count);
            await assertTouchTarget(
                tile.locator(".launcher-folder-background"),
                "Sparse large folder opener",
                "bottom-center",
            );
            for (let index = 0; index < count; index++) {
                await assertTouchTarget(
                    buttons.nth(index),
                    "Sparse large folder preview",
                );
            }
            const geometry = await tile.evaluate((tile) => {
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
                geometry,
                Array(count).fill(true),
                "Sparse preview glyphs stay inside the surface and clear of the title",
            );
        }
        await touchPage.screenshot({
            path: `${EVIDENCE_DIR}/large-preview-variants-390.png`,
        });
        report.screenshots.push(
            `${EVIDENCE_DIR}/large-preview-variants-390.png`,
        );
        report.completed = true;
    } catch (error) {
        report.error = error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);
        throw error;
    } finally {
        report.finishedAt = new Date().toISOString();
        await Deno.writeTextFile(
            `${EVIDENCE_DIR}/report.json`,
            JSON.stringify(report, null, 2),
        );
        await desktopContext?.close();
        await touchContext?.close();
        await browser.close();
        await app.close();
    }
});
