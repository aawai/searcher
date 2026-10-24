import { assert, assertEquals } from "@std/assert";
import { type Browser, type BrowserContext, type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { startProductionApp } from "./helpers/production-app.ts";
import { openMoreApps } from "./helpers/app-library.ts";
import { closeLibrary, libraryPanel, libraryView } from "./helpers/library.ts";

// Issue #244 acceptance on the real page: the home page is the app library.
// Capacity / 更多, folder previews, layered Escape, soft-keyboard guard, the
// 在首页显示应用 preference, in-place management and note placement.

interface HomeMetrics {
    rows: number;
    expectedRows: number;
    columns: number;
    cellCount: number;
    tileCount: number;
    pitch: number;
    gridTop: number;
    plateBottom: number;
    viewportHeight: number;
    distinctLefts: number;
    moreLabel: string | null;
    hasAdd: boolean;
    large: { width: number; height: number } | null;
    app: { width: number } | null;
    columnGap: number;
}

// Runs in the page. Kept as one function so it can be installed as an init
// script and used from waitForFunction predicates.
function measureHome(): HomeMetrics | null {
    const grid = document.querySelector<HTMLElement>(".launcher-grid--home");
    if (!grid) return null;
    const css = getComputedStyle(grid);
    const cell = Number.parseFloat(css.gridAutoRows);
    const gap = Number.parseFloat(css.rowGap);
    const cells = Array.from(
        grid.querySelectorAll<HTMLElement>(":scope > .launcher-tile"),
    );
    if (cells.length === 0 || !Number.isFinite(cell)) return null;
    const boxes = cells.map((element) => element.getBoundingClientRect());
    const top = Math.min(...boxes.map((box) => box.top));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    const pitch = cell + gap;
    const gridBox = grid.getBoundingClientRect();
    const plate = grid.closest<HTMLElement>(".launcher-plate");
    const plateBox = plate?.getBoundingClientRect() ?? gridBox;
    const platePadding = plate
        ? Number.parseFloat(getComputedStyle(plate).paddingBottom)
        : 0;
    const viewportHeight = document.documentElement.clientHeight;
    const largeTile = cells.find((element) =>
        element.querySelector(".launcher-folder-item--large")
    );
    const appTile = cells.find((element) =>
        element.querySelector(".launcher-app")
    );
    const more = grid.querySelector<HTMLElement>('[data-library-cell="more"]');
    return {
        rows: Math.round((bottom - top + gap) / pitch),
        expectedRows: Math.min(
            4,
            Math.max(
                1,
                Math.floor(
                    (viewportHeight - gridBox.top - 48 - platePadding) / pitch,
                ),
            ),
        ),
        columns: Number(grid.dataset.columns),
        cellCount: cells.length,
        tileCount:
            grid.querySelectorAll(":scope > .launcher-tile[data-tile-id]")
                .length,
        pitch,
        gridTop: gridBox.top,
        plateBottom: plateBox.bottom,
        viewportHeight,
        distinctLefts: new Set(boxes.map((box) => Math.round(box.left))).size,
        moreLabel: more?.getAttribute("aria-label") ?? null,
        hasAdd: Boolean(grid.querySelector('[data-library-cell="add"]')),
        large: largeTile
            ? {
                width: largeTile.getBoundingClientRect().width,
                height: largeTile.getBoundingClientRect().height,
            }
            : null,
        app: appTile ? { width: appTile.getBoundingClientRect().width } : null,
        columnGap: Number.parseFloat(css.columnGap),
    };
}

type HomeWindow = { __measureHome: () => HomeMetrics | null };

async function homeMetrics(page: Page): Promise<HomeMetrics> {
    const metrics = await page.evaluate(() =>
        (globalThis as unknown as HomeWindow).__measureHome()
    );
    assert(metrics, "home grid is rendered");
    return metrics;
}

/** The plan follows the measured geometry (rows === expectedRows). */
async function waitForPlannedHome(page: Page): Promise<HomeMetrics> {
    await page.waitForFunction(() => {
        const m = (globalThis as unknown as HomeWindow).__measureHome();
        return !!m && m.rows === m.expectedRows && m.columns > 0;
    });
    return await homeMetrics(page);
}

interface FolderSeed {
    name: string;
    size: "small" | "large";
    sortOrder: number;
    members: number;
}
interface AppSeed {
    name: string;
    sortOrder: number;
}

async function seedLibrary(
    page: Page,
    folders: FolderSeed[],
    apps: AppSeed[],
) {
    await page.evaluate(async ({ folders, apps }) => {
        const post = async (path: string, body: unknown) => {
            const response = await fetch(path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                throw new Error(`${path}: ${await response.text()}`);
            }
            return (await response.json()).data as { id: string };
        };
        let counter = 0;
        for (const folder of folders) {
            const group = await post("/api/webapp-groups", {
                name: folder.name,
                folderSize: folder.size,
                sortOrder: folder.sortOrder,
                isHomeFixed: true,
            });
            for (let index = 0; index < folder.members; index++) {
                await post("/api/webapps", {
                    name: `${folder.name}成员${index + 1}`,
                    url: `https://member-${counter++}.example/`,
                    groupId: group.id,
                    sortOrder: index,
                });
            }
        }
        for (const app of apps) {
            await post("/api/webapps", {
                name: app.name,
                url: `https://root-${counter++}.example/`,
                sortOrder: app.sortOrder,
                isHomeFixed: true,
            });
        }
    }, { folders, apps });
}

// 3 folders (large with 12 members, small, a small one sorted last) and 30
// root apps: 33 root tiles, 36 cells.
const BIG_FOLDERS: FolderSeed[] = [
    { name: "大文件夹", size: "large", sortOrder: 0, members: 12 },
    { name: "小文件夹", size: "small", sortOrder: 1, members: 3 },
    { name: "尾部文件夹", size: "small", sortOrder: 100, members: 2 },
];
const BIG_APPS: AppSeed[] = Array.from({ length: 30 }, (_, index) => ({
    name: `应用${String(index + 1).padStart(2, "0")}`,
    sortOrder: index + 2,
}));
const BIG_ROOT_TILES = BIG_FOLDERS.length + BIG_APPS.length;

let userCounter = 0;
async function signedInPage(
    browser: Browser,
    origin: string,
    options: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ page: Page; context: BrowserContext }> {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
        ...options,
    });
    // Layout fixtures must not perform real website/DNS lookups in the
    // background. Icon fetching has its own controlled contract tests.
    await context.route(
        "**/api/webapps/*/fetch-icon",
        (route) => route.abort(),
    );
    await context.addInitScript(
        `window.__measureHome = ${measureHome.toString()};`,
    );
    const page = await context.newPage();
    await page.goto(origin + "/register");
    await page.locator("#auth-username").fill(`library_user_${++userCounter}`);
    await page.locator("#auth-display-name").fill("Library tester");
    await page.locator("#auth-password").fill("Library-test-password-244!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    return { page, context };
}

async function bigLibraryPage(
    browser: Browser,
    origin: string,
    options: Parameters<Browser["newContext"]>[0] = {},
) {
    const session = await signedInPage(browser, origin, options);
    await seedLibrary(session.page, BIG_FOLDERS, BIG_APPS);
    await session.page.reload();
    await session.page.locator(".launcher-grid--home").waitFor();
    return session;
}

const homeTiles = (page: Page) =>
    page.locator(".launcher-grid--home > .launcher-tile");

async function visualLabels(page: Page): Promise<string[]> {
    return await homeTiles(page).evaluateAll((tiles) =>
        tiles.map((tile) =>
            tile.querySelector(".webapp-name, .launcher-folder-name")
                ?.textContent?.trim() ?? ""
        )
    );
}

async function setShowHomeApps(page: Page, origin: string, show: boolean) {
    await page.goto(origin + "/settings/appearance");
    const toggle = page.getByRole("switch", { name: "在首页显示应用" });
    await toggle.waitFor();
    const saved = page.waitForResponse((response) =>
        response.url().endsWith("/api/preferences") &&
        response.request().method() === "PATCH"
    );
    if ((await toggle.getAttribute("aria-checked") === "true") !== show) {
        await toggle.click();
        assertEquals((await saved).status(), 200);
    }
    await page.goto(origin + "/");
    await page.locator("#search-query").waitFor();
}

Deno.test("home app library (#244)", async (t) => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        await t.step(
            "desktop capacity: rows follow the viewport, 更多（N） counts overflow, large folder is 2x2",
            async () => {
                const { page, context } = await bigLibraryPage(
                    browser,
                    app.origin,
                );
                try {
                    // 1440x900: four rows, 48px clear of the viewport bottom.
                    let m = await waitForPlannedHome(page);
                    assertEquals(m.columns, 6);
                    assertEquals(m.rows, 4);
                    assert(
                        m.viewportHeight - m.plateBottom >= 48 - 0.5,
                        `plate bottom ${m.plateBottom} leaves < 48px in ${m.viewportHeight}`,
                    );
                    // 4 rows x 6 columns = 24 cells; the large folder takes 4,
                    // 更多 takes the last: 23 tiles' worth of cells are visible
                    // (large 4 + small 1 + 18 apps) and 12 apps + the tail
                    // folder move into 更多.
                    assertEquals(m.cellCount - 1, 20);
                    assertEquals(m.tileCount, 20);
                    assertEquals(m.moreLabel, "更多（13）");
                    assertEquals(m.hasAdd, false);
                    assert(m.large && m.app, "large folder and an app render");
                    assert(
                        Math.abs(
                            m.large.width - (2 * m.app.width + m.columnGap),
                        ) < 1,
                        `large folder width ${m.large.width}`,
                    );
                    assert(
                        Math.abs(m.large.height - m.large.width) < 1,
                        "large folder is square",
                    );

                    // Shorter windows re-plan to fewer rows and never touch
                    // the bottom; N always equals the tiles not shown.
                    const rowsBySize = new Map<number, number>();
                    for (
                        const size of [
                            { width: 1366, height: 768 },
                            { width: 1280, height: 720 },
                        ]
                    ) {
                        await page.setViewportSize(size);
                        await page.waitForFunction((height) => {
                            const m = (globalThis as unknown as HomeWindow)
                                .__measureHome();
                            return !!m && m.viewportHeight === height &&
                                m.rows === m.expectedRows;
                        }, size.height);
                        m = await homeMetrics(page);
                        rowsBySize.set(size.height, m.rows);
                        assert(m.rows >= 1 && m.rows <= 4);
                        assert(
                            m.viewportHeight - m.plateBottom >= 48 - 0.5,
                            `${size.height}: plate bottom ${m.plateBottom} too close to the bottom`,
                        );
                        assertEquals(
                            m.moreLabel,
                            `更多（${BIG_ROOT_TILES - m.tileCount}）`,
                        );
                    }
                    assert(
                        rowsBySize.get(720)! < 4,
                        "1280x720 cannot hold four rows",
                    );
                    assert(rowsBySize.get(720)! <= rowsBySize.get(768)!);

                    // Growing back re-plans again.
                    await page.setViewportSize({ width: 1440, height: 900 });
                    await page.waitForFunction(() => {
                        const m = (globalThis as unknown as HomeWindow)
                            .__measureHome();
                        return !!m && m.viewportHeight === 900 && m.rows === 4;
                    });
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "mobile touch: four columns inside the plate, 3x3 folder preview and whole-surface activation",
            async () => {
                const { page, context } = await bigLibraryPage(
                    browser,
                    app.origin,
                    {
                        viewport: { width: 390, height: 844 },
                        isMobile: true,
                        hasTouch: true,
                    },
                );
                try {
                    const m = await waitForPlannedHome(page);
                    assertEquals(m.columns, 4);
                    assertEquals(m.distinctLefts, 4);
                    assert(m.moreLabel?.startsWith("更多（"));
                    assert(m.large && m.app);
                    assert(
                        Math.abs(
                            m.large.width - (2 * m.app.width + m.columnGap),
                        ) < 1,
                    );
                    const folder = page.locator(
                        ".launcher-folder-item--large",
                        { hasText: "大文件夹" },
                    );
                    assertEquals(
                        await folder.locator("button.launcher-folder-mini")
                            .evaluateAll((buttons) =>
                                buttons.map((button) =>
                                    button.getAttribute("aria-label")
                                )
                            ),
                        [
                            ...Array.from(
                                { length: 8 },
                                (_, i) => `打开 大文件夹成员${i + 1}`,
                            ),
                            "打开文件夹 大文件夹，另有 4 个应用",
                        ],
                    );
                    const opener = folder.locator(
                        ".launcher-folder-background",
                    );
                    const box = await opener.boundingBox();
                    assert(
                        box && box.width >= 44 && box.height >= 44,
                        "touch targets are at least 44px",
                    );
                    await opener.tap();
                    await page.locator(".launcher-popup-title", {
                        hasText: "大文件夹",
                    }).waitFor();
                    assertEquals(
                        await page.locator(
                            ".launcher-popup .launcher-grid > .launcher-tile",
                        ).count(),
                        12,
                    );
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "desktop large folder: 8 clickable icons + remainder cell opens the folder; Escape returns focus",
            async () => {
                const { page, context } = await bigLibraryPage(
                    browser,
                    app.origin,
                );
                try {
                    await waitForPlannedHome(page);
                    const folder = page.locator(
                        ".launcher-folder-item--large",
                        { hasText: "大文件夹" },
                    );
                    assertEquals(
                        await folder.locator("button.launcher-folder-mini")
                            .evaluateAll((buttons) =>
                                buttons.map((button) =>
                                    button.getAttribute("aria-label")
                                )
                            ),
                        [
                            ...Array.from(
                                { length: 8 },
                                (_, index) => `打开 大文件夹成员${index + 1}`,
                            ),
                            "打开文件夹 大文件夹，另有 4 个应用",
                        ],
                    );
                    const remainder = folder.getByRole("button", {
                        name: "打开文件夹 大文件夹，另有 4 个应用",
                    });
                    await remainder.click();
                    const popup = page.locator(".launcher-popup");
                    await popup.locator(".launcher-popup-title", {
                        hasText: "大文件夹",
                    }).waitFor();
                    assertEquals(
                        await popup.locator(".launcher-popup-count")
                            .textContent(),
                        "12 个应用",
                    );
                    assertEquals(
                        await popup.locator(".launcher-grid > .launcher-tile")
                            .count(),
                        12,
                    );
                    await page.keyboard.press("Escape");
                    await popup.waitFor({ state: "detached" });
                    await page.waitForFunction(() =>
                        document.activeElement?.getAttribute("aria-label") ===
                            "打开文件夹 大文件夹，另有 4 个应用"
                    );
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "更多 opens the library app view; Escape returns to the home grid",
            async () => {
                const { page, context } = await bigLibraryPage(
                    browser,
                    app.origin,
                );
                try {
                    await waitForPlannedHome(page);
                    const more = page.getByRole("button", {
                        name: "更多（13）",
                    });
                    const view = await openMoreApps(page, more);
                    await view.getByText("全部应用", { exact: true })
                        .waitFor();
                    assertEquals(
                        await view.locator(
                            "[data-library-apps-grid] > :is(.launcher-app, .launcher-folder-item)",
                        ).count(),
                        BIG_ROOT_TILES,
                    );
                    assertEquals(
                        await libraryPanel(page).getByRole("button", {
                            name: "添加应用",
                            exact: true,
                        }).count(),
                        1,
                    );
                    await view.locator(".launcher-folder-item", {
                        hasText: "尾部文件夹",
                    }).click();
                    await view.getByText("尾部文件夹", { exact: true })
                        .waitFor();
                    await view.getByRole("button", {
                        name: "返回应用列表",
                        exact: true,
                    }).click();
                    await view.getByText("全部应用", { exact: true })
                        .waitFor();
                    await closeLibrary(page);
                    await page.waitForFunction(() =>
                        document.activeElement?.getAttribute("aria-label") ===
                            "更多（13）"
                    );
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "soft keyboard resize with a focused input keeps the plan; a plain window resize re-plans",
            async () => {
                const { page, context } = await bigLibraryPage(
                    browser,
                    app.origin,
                    {
                        viewport: { width: 390, height: 844 },
                        isMobile: true,
                        hasTouch: true,
                    },
                );
                try {
                    const before = await waitForPlannedHome(page);
                    const labelsBefore = await visualLabels(page);
                    await page.locator("#search-query").focus();
                    await page.waitForFunction(() =>
                        document.activeElement?.id === "search-query"
                    );
                    // A soft keyboard shrinks the layout viewport; the width
                    // stays and an editable field is focused.
                    await page.setViewportSize({ width: 390, height: 480 });
                    await page.waitForFunction(() =>
                        document.documentElement.clientHeight === 480
                    );
                    await page.evaluate(() =>
                        new Promise<void>((resolve) =>
                            requestAnimationFrame(() =>
                                requestAnimationFrame(() => resolve())
                            )
                        )
                    );
                    const during = await homeMetrics(page);
                    assertEquals(during.cellCount, before.cellCount);
                    assertEquals(during.rows, before.rows);
                    assertEquals(await visualLabels(page), labelsBefore);

                    // Without a focused input the same kind of resize re-plans.
                    await page.locator("#search-query").blur();
                    await page.setViewportSize({ width: 390, height: 520 });
                    await page.waitForFunction(
                        (cells) => {
                            const m = (globalThis as unknown as HomeWindow)
                                .__measureHome();
                            return !!m && m.cellCount < cells &&
                                m.rows === m.expectedRows;
                        },
                        before.cellCount,
                    );
                    const after = await homeMetrics(page);
                    assert(after.rows < before.rows);
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "在首页显示应用 off: no grid, search box stays, 应用 entry opens the library, search still opens apps and folders, on restores order",
            async () => {
                const { page, context } = await bigLibraryPage(
                    browser,
                    app.origin,
                );
                try {
                    await waitForPlannedHome(page);
                    const search = page.locator("#search-query");
                    const boxOn = await search.boundingBox();
                    assert(boxOn);
                    const orderOn = await visualLabels(page);

                    await setShowHomeApps(page, app.origin, false);
                    // Focusing the empty box offers 应用 only while the grid
                    // is off, so its presence also marks the loaded state.
                    await search.focus();
                    const entry = page.getByRole("option", {
                        name: "应用",
                        exact: true,
                    });
                    await entry.waitFor();
                    assertEquals(
                        await page.locator(".launcher-grid").count(),
                        0,
                    );
                    assertEquals(
                        await page.locator(".launcher-library").count(),
                        0,
                    );
                    const boxOff = await search.boundingBox();
                    assert(boxOff);
                    for (const key of ["x", "y", "width", "height"] as const) {
                        assert(
                            Math.abs(boxOn[key] - boxOff[key]) < 1,
                            `search box ${key}: ${boxOn[key]} vs ${
                                boxOff[key]
                            }`,
                        );
                    }

                    await entry.click();
                    const appsView = libraryView(page, "apps");
                    await appsView.waitFor();
                    assertEquals(
                        await appsView.locator(
                            "[data-library-apps-grid] > :is(.launcher-app, .launcher-folder-item)",
                        ).count(),
                        BIG_ROOT_TILES,
                    );
                    await libraryPanel(page).getByRole("button", {
                        name: "添加应用",
                        exact: true,
                    }).waitFor();
                    assertEquals(
                        await page.locator(".launcher-popup").count(),
                        0,
                    );
                    await closeLibrary(page);

                    // Suggestions still match apps and folders.
                    await search.fill("应用07");
                    await page.getByRole("option").filter({
                        hasText: "应用07",
                    }).first().waitFor();
                    await search.fill("尾部文件夹");
                    const folderOption = page.getByRole("option").filter({
                        hasText: "尾部文件夹",
                    }).first();
                    await folderOption.waitFor();
                    await folderOption.click();
                    const popup = page.locator(".launcher-popup");
                    await popup.locator(".launcher-popup-title", {
                        hasText: "尾部文件夹",
                    }).waitFor();
                    assertEquals(
                        await popup.locator(".launcher-grid > .launcher-tile")
                            .count(),
                        2,
                    );
                    await page.keyboard.press("Escape");
                    await popup.waitFor({ state: "detached" });

                    await setShowHomeApps(page, app.origin, true);
                    await page.locator(".launcher-grid--home").waitFor();
                    await waitForPlannedHome(page);
                    assertEquals(await visualLabels(page), orderOn);
                    await search.focus();
                    assertEquals(
                        await page.getByRole("option", {
                            name: "应用",
                            exact: true,
                        }).count(),
                        0,
                    );
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "in-place management: item menus, new folder at the end, drag into a folder",
            async () => {
                const { page, context } = await signedInPage(
                    browser,
                    app.origin,
                );
                try {
                    await seedLibrary(
                        page,
                        [{
                            name: "收纳",
                            size: "small",
                            sortOrder: 2,
                            members: 1,
                        }],
                        [
                            { name: "应用甲", sortOrder: 0 },
                            { name: "应用乙", sortOrder: 1 },
                        ],
                    );
                    await page.reload();
                    await page.locator(".launcher-grid--home").waitFor();
                    await homeTiles(page).first().waitFor();

                    await homeTiles(page).filter({ hasText: "应用甲" })
                        .locator(".launcher-app").click({ button: "right" });
                    const menu = page.getByRole("menu");
                    await menu.waitFor();
                    const items = await menu.getByRole("menuitem")
                        .allInnerTexts();
                    assert(items.includes("编辑"), items.join("|"));
                    assert(
                        items.some((item) => item === "移至文件夹 收纳"),
                        items.join("|"),
                    );
                    assert(items.includes("移至回收站"), items.join("|"));
                    assert(
                        items.includes("取消固定"),
                        "pinned root app offers unpin: " + items.join("|"),
                    );
                    await page.keyboard.press("Escape");
                    await menu.waitFor({ state: "detached" });

                    // Blank area: right-click inside the grid's empty last
                    // column of row 0 (2 apps + 2 folders + add = 5 cells at most).
                    const openBlankMenu = async () => {
                        const grid = await page.locator(".launcher-grid--home")
                            .boundingBox();
                        assert(grid);
                        await page.mouse.click(
                            grid.x + grid.width - 12,
                            grid.y + 20,
                            { button: "right" },
                        );
                        await page.getByRole("menuitem", { name: "新建文件夹" })
                            .waitFor();
                    };
                    await openBlankMenu();
                    await page.getByRole("menuitem", { name: "新建文件夹" })
                        .click();
                    await page.locator("#folder-name-input").fill("新文件夹");
                    await page.getByRole("button", { name: "创建" }).click();
                    await page.waitForFunction(() => {
                        const names = Array.from(
                            document.querySelectorAll(
                                ".launcher-grid--home > .launcher-tile[data-tile-id] .launcher-folder-name, .launcher-grid--home > .launcher-tile[data-tile-id] .webapp-name",
                            ),
                        ).map((node) => node.textContent?.trim());
                        return names[names.length - 1] === "新文件夹";
                    });

                    await page.locator("#folder-name-input").waitFor({
                        state: "detached",
                    });
                    // 整理布局: dragging an app onto a folder moves it in.
                    await openBlankMenu();
                    await page.getByRole("menuitem", { name: "整理布局" })
                        .click();
                    await page.getByText("整理中").waitFor();
                    const source = await homeTiles(page).filter({
                        hasText: "应用乙",
                    }).locator(".webapp-icon").boundingBox();
                    const target = await homeTiles(page).filter({
                        hasText: "新文件夹",
                    }).locator(".launcher-folder-background").boundingBox();
                    assert(source && target);
                    await page.mouse.move(
                        source.x + source.width / 2,
                        source.y + source.height / 2,
                    );
                    await page.mouse.down();
                    await page.mouse.move(
                        source.x + source.width / 2 + 20,
                        source.y + source.height / 2,
                        { steps: 4 },
                    );
                    await page.mouse.move(
                        target.x + target.width / 2,
                        target.y + target.height / 2,
                        { steps: 12 },
                    );
                    await page.mouse.up();
                    await page.waitForFunction(async () => {
                        const [apps, groups] = await Promise.all([
                            fetch("/api/webapps").then((r) => r.json()),
                            fetch("/api/webapp-groups").then((r) => r.json()),
                        ]);
                        const folder = groups.data.find((group: {
                            name: string;
                        }) => group.name === "新文件夹");
                        const moved = apps.data.find((item: { name: string }) =>
                            item.name === "应用乙"
                        );
                        return Boolean(folder && moved) &&
                            moved.groupId === folder.id;
                    });
                    assertEquals(
                        await homeTiles(page).filter({ hasText: "应用乙" })
                            .count(),
                        0,
                    );
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "arrange mode: keyboard move follows visual order after backfill",
            async () => {
                const { page, context } = await signedInPage(
                    browser,
                    app.origin,
                );
                try {
                    // Canonical a1..a5, large, a6: a6 backfills the gap next
                    // to a5 while the large folder wraps to the second row.
                    await seedLibrary(
                        page,
                        [{
                            name: "大A",
                            size: "large",
                            sortOrder: 5,
                            members: 2,
                        }],
                        [1, 2, 3, 4, 5, 6].map((n) => ({
                            name: `键${n}`,
                            sortOrder: n < 6 ? n - 1 : 6,
                        })),
                    );
                    await page.reload();
                    await page.locator(".launcher-grid--home").waitFor();
                    await homeTiles(page).first().waitFor();
                    assertEquals(
                        await visualLabels(page),
                        [
                            "键1",
                            "键2",
                            "键3",
                            "键4",
                            "键5",
                            "键6",
                            "大A",
                            "添加应用",
                        ],
                    );

                    const grid = await page.locator(".launcher-grid--home")
                        .boundingBox();
                    assert(grid);
                    // Empty cell right of the large folder on row 1.
                    await page.mouse.click(
                        grid.x + grid.width - 12,
                        grid.y + (await homeMetrics(page)).pitch + 20,
                        { button: "right" },
                    );
                    await page.getByRole("menuitem", { name: "整理布局" })
                        .click();
                    await page.getByText("整理中").waitFor();
                    await homeTiles(page).filter({ hasText: "键6" })
                        .locator(".webapp-icon").focus();
                    await page.keyboard.press("ArrowLeft");
                    await page.waitForFunction(() => {
                        const names = Array.from(
                            document.querySelectorAll(
                                ".launcher-grid--home > .launcher-tile[data-tile-id]",
                            ),
                        ).map((tile) =>
                            tile.querySelector(
                                ".webapp-name, .launcher-folder-name",
                            )?.textContent?.trim()
                        );
                        return names.join(",") ===
                            "键1,键2,键3,键4,键6,键5,大A";
                    });
                } finally {
                    await context.close();
                }
            },
        );

        await t.step(
            "default notes stay clear of the library region and keep their side columns when it is hidden",
            async () => {
                const { page, context } = await bigLibraryPage(
                    browser,
                    app.origin,
                );
                try {
                    await waitForPlannedHome(page);
                    // Enough default-placed notes (no stored layout) that the
                    // free space beside the library cannot hold all of them.
                    const statuses = await page.evaluate(async () => {
                        const result: number[] = [];
                        for (let index = 1; index <= 8; index++) {
                            const response = await fetch("/api/documents", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    title: `默认落点便签${index}`,
                                    body: "no explicit layout",
                                    isHomeFixed: true,
                                }),
                            });
                            result.push(response.status);
                        }
                        return result;
                    });
                    assertEquals(statuses, Array(8).fill(200));
                    type Box = {
                        left: number;
                        top: number;
                        right: number;
                        bottom: number;
                    };
                    const intersects = (a: Box, b: Box) =>
                        a.left < b.right && b.left < a.right &&
                        a.top < b.bottom && b.top < a.bottom;
                    const placed = async () => {
                        await page.locator(".home-notes--grid").waitFor();
                        await page.waitForFunction(() =>
                            document.querySelectorAll(".home-note").length > 0
                        );
                        return await page.evaluate(() => {
                            const box = (element: Element): Box => {
                                const rect = element.getBoundingClientRect();
                                return {
                                    left: rect.left,
                                    top: rect.top,
                                    right: rect.right,
                                    bottom: rect.bottom,
                                };
                            };
                            const library = document.querySelector(
                                ".launcher-library",
                            );
                            return {
                                library: library ? box(library) : null,
                                notes: Array.from(
                                    document.querySelectorAll(".home-note"),
                                ).map(box),
                            };
                        });
                    };
                    await page.reload();
                    await page.locator(".launcher-grid--home").waitFor();
                    const on = await placed();
                    assert(on.library && on.library.bottom > on.library.top);
                    assert(on.notes.length > 0);
                    for (const note of on.notes) {
                        assert(
                            !intersects(note, on.library),
                            `note ${JSON.stringify(note)} overlaps library ${
                                JSON.stringify(on.library)
                            }`,
                        );
                    }

                    // With the grid off nothing reserves that region any more.
                    await setShowHomeApps(page, app.origin, false);
                    const off = await placed();
                    assertEquals(off.library, null);
                    for (const note of off.notes) {
                        assert(
                            !intersects(note, on.library!),
                            `note ${
                                JSON.stringify(note)
                            } keeps the former app region empty`,
                        );
                    }
                } finally {
                    await context.close();
                }
            },
        );
        await t.step(
            "folder Material follows glass tiers and reduced-transparency on the real page",
            async () => {
                const { page, context } = await signedInPage(
                    browser,
                    app.origin,
                );
                try {
                    await seedLibrary(page, [
                        {
                            name: "材质大文件夹",
                            size: "large",
                            sortOrder: 0,
                            members: 10,
                        },
                        {
                            name: "材质小文件夹",
                            size: "small",
                            sortOrder: 1,
                            members: 1,
                        },
                    ], []);
                    const appearance = async (
                        theme: "light" | "dark",
                        glassIntensity: "off" | "soft" | "regular" | "clear",
                    ) => {
                        await page.evaluate(async (preferences) => {
                            const response = await fetch("/api/preferences", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(preferences),
                            });
                            if (!response.ok) {
                                throw new Error(await response.text());
                            }
                        }, { theme, glassIntensity });
                        await page.reload();
                        await page.waitForFunction(
                            ({ theme, glassIntensity }) =>
                                document.documentElement.dataset.theme ===
                                    theme &&
                                document.documentElement.dataset.glass ===
                                    glassIntensity,
                            { theme, glassIntensity },
                            { timeout: 5000 },
                        );
                        await page.locator(".launcher-folder-surface").first()
                            .waitFor();
                        await page.waitForFunction(
                            () =>
                                document.getAnimations().every((animation) =>
                                    !Number.isFinite(
                                        animation.effect?.getComputedTiming()
                                            .endTime,
                                    ) ||
                                    (animation.playState !== "running" &&
                                        !animation.pending)
                                ),
                            undefined,
                            { timeout: 5000 },
                        );
                    };
                    const surfaces = () =>
                        page.locator(".launcher-folder-surface").evaluateAll(
                            (elements) => {
                                const canvas = document.createElement("canvas");
                                canvas.width = canvas.height = 1;
                                const paint = canvas.getContext("2d")!;
                                return elements.map((element) => {
                                    const style = getComputedStyle(element);
                                    paint.clearRect(0, 0, 1, 1);
                                    paint.fillStyle = style.backgroundColor;
                                    paint.fillRect(0, 0, 1, 1);
                                    return {
                                        alpha: paint.getImageData(0, 0, 1, 1)
                                            .data[3],
                                        filter: style.backdropFilter,
                                        edge: style.boxShadow,
                                    };
                                });
                            },
                        );
                    for (const theme of ["light", "dark"] as const) {
                        const alpha: number[] = [];
                        for (
                            const tier of [
                                "off",
                                "soft",
                                "regular",
                                "clear",
                            ] as const
                        ) {
                            await appearance(theme, tier);
                            const actual = await surfaces();
                            assertEquals(actual.length, 2);
                            assertEquals(actual[0].alpha, actual[1].alpha);
                            for (const surface of actual) {
                                assert(
                                    surface.edge !== "none",
                                    "Material keeps its edge",
                                );
                                if (tier === "off") {
                                    assertEquals(surface.alpha, 255);
                                    assertEquals(surface.filter, "none");
                                } else {
                                    assert(surface.alpha < 255);
                                    assert(surface.filter.includes("blur("));
                                }
                            }
                            alpha.push(actual[0].alpha);
                        }
                        assert(
                            alpha.every((value, index) =>
                                index === 0 || value <= alpha[index - 1]
                            ),
                            "glass tiers progressively reveal more of the wallpaper",
                        );
                    }
                    const cdp = await context.newCDPSession(page);
                    await cdp.send("Emulation.setEmulatedMedia", {
                        features: [{
                            name: "prefers-reduced-transparency",
                            value: "reduce",
                        }],
                    });
                    await appearance("light", "clear");
                    for (const surface of await surfaces()) {
                        assertEquals(surface.alpha, 255);
                        assertEquals(surface.filter, "none");
                        assert(surface.edge !== "none");
                    }
                } finally {
                    await context.close();
                }
            },
        );
    } finally {
        await browser.close();
        await app.close();
    }
});
