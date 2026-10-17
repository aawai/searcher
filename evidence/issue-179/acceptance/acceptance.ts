import { chromium } from "playwright";
import type { Browser, BrowserContext, Page, Response, Route } from "playwright";
import { join } from "node:path";

type Style = "zen" | "widgets";
type Theme = "light" | "dark";
type Box = { x: number; y: number; width: number; height: number };
type Check = { name: string; pass: boolean; expected?: unknown; actual?: unknown; detail?: string };
type Scenario = { id: string; checks: Check[]; metrics?: unknown; screenshots?: string[]; error?: string };
type Report = { phase: string; origin: string; startedAt: string; finishedAt?: string; status?: string; failures?: string[]; scenarios: Scenario[] };

const origin = Deno.env.get("ISSUE179_ORIGIN");
if (!origin) throw new Error("Set ISSUE179_ORIGIN to the running acceptance fixture URL");
const phase = Deno.args.includes("--widgets-only") ? "widgets-only" : Deno.args.includes("--focus") ? "focus" : Deno.args.includes("--full") ? "full" : "baseline";
const root = join(Deno.cwd(), "artifacts/issue-179");
const screenshotsDir = join(root, `${phase}-screenshots`);
await Deno.mkdir(screenshotsDir, { recursive: true });
const report: Report = {
    phase,
    origin,
    startedAt: new Date().toISOString(),
    scenarios: [],
};
const failures: string[] = [];
let browser: Browser | undefined;

function check(scenario: Scenario, name: string, pass: boolean, expected?: unknown, actual?: unknown, detail?: string) {
    scenario.checks.push({ name, pass, expected, actual, detail });
    if (!pass) failures.push(`${scenario.id}: ${name}${detail ? ` (${detail})` : ""}`);
}

async function settle(page: Page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})));
        for (let i = 0; i < 2; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
}

async function register(page: Page) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const credentials = {
        username: `issue179_${suffix}`,
        password: "Issue179-matrix-pass!",
        displayName: "Issue 179 Matrix",
    };
    await page.goto(`${origin}/register`);
    await page.locator("#auth-username").fill(credentials.username);
    await page.locator("#auth-display-name").fill(credentials.displayName);
    await page.locator("#auth-password").fill(credentials.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${origin}/`);
    await page.locator("main").waitFor({ state: "visible" });
    return credentials;
}

async function login(page: Page, credentials: { username: string; password: string }) {
    await page.goto(`${origin}/login`);
    await page.locator("#auth-username").fill(credentials.username);
    await page.locator("#auth-password").fill(credentials.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${origin}/`);
    await page.locator("main").waitFor({ state: "visible" });
}

async function seedApps(page: Page) {
    const result = await page.evaluate(async () => {
        for (let index = 0; index < 32; index++) {
            const response = await fetch("/api/webapps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `Issue 179 App ${String(index + 1).padStart(2, "0")}`,
                    url: `https://issue179-${index + 1}.example/`,
                    sortOrder: index,
                    groupId: null,
                    iconSource: "default",
                    openMode: "global",
                }),
            });
            if (!response.ok) throw new Error(`Could not seed app ${index + 1}: ${response.status} ${await response.text()}`);
        }
        return { appCount: 32 };
    });
    return result;
}

async function setPreferences(page: Page, style: Style, theme: Theme) {
    const result = await page.evaluate(async ({ style, theme }) => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style, theme }),
        });
        return { ok: response.ok, status: response.status, body: await response.text() };
    }, { style, theme });
    if (!result.ok) throw new Error(`Could not set preferences ${style}/${theme}: ${result.status} ${result.body}`);
}

async function openApps(page: Page) {
    const currentGrid = page.locator(".apps-workspace-root .launcher-grid--workspace:visible, .apps-workspace .launcher-grid:visible").first();
    if (await currentGrid.isVisible()) {
        await settle(page);
        return;
    }
    const selectors = [
        '.workspace-mobile-navigation button[data-workspace="apps"]',
        '.desktop-dock button[data-workspace="apps"]',
        '.zen-edge-trigger button[data-workspace="apps"]',
        '.zen-edge-btn[data-workspace="apps"]',
        'button[aria-label="应用工作区"]',
    ];
    let opened = false;
    for (const selector of selectors) {
        const candidates = page.locator(selector);
        for (let index = 0; index < await candidates.count(); index++) {
            const trigger = candidates.nth(index);
            if (!await trigger.isVisible()) continue;
            const hit = await trigger.evaluate((button: HTMLElement) => {
                const rect = button.getBoundingClientRect();
                const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
                return target === button || Boolean(target && button.contains(target));
            });
            if (!hit) continue;
            await trigger.click();
            opened = true;
            break;
        }
        if (opened) break;
    }
    if (!opened) throw new Error("No visible, hit-testable Apps workspace trigger");
    const host = page.locator(".apps-workspace").first();
    await host.waitFor({ state: "visible" });
    await page.locator(".workspace-header:visible, .desktop-window-chrome:visible").first().waitFor({ state: "visible" });
    await page.locator(".launcher-grid--workspace:visible, .launcher-grid:visible, .apps-workspace [role=alert]:visible").first().waitFor({ state: "visible" });
    await settle(page);
}

async function measure(page: Page) {
    return await page.evaluate(() => {
        const box = (element: Element | null): Box | null => {
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        };
        const isVisible = (element: Element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const topbar = document.querySelector(".topbar");
        const banner = document.querySelector(".connection-banner");
        let chromeBottom = 0;
        for (const element of document.querySelectorAll(".topbar, .connection-banner")) {
            if (isVisible(element)) chromeBottom = Math.max(chromeBottom, element.getBoundingClientRect().bottom);
        }
        const search = document.querySelector("#search-query, .search-form input");
        const workspace = document.querySelector(
            '.desktop-window[data-window-id="apps"]:not([hidden]), .workspace-panel--mobile, aside.workspace-panel[data-presentation="panel"], aside.workspace-panel, .workspace-panel',
        );
        const workspaceStyle = workspace ? getComputedStyle(workspace) : null;
        const workspaceRect = workspace?.getBoundingClientRect();
        const grid = document.querySelector<HTMLElement>(".apps-workspace-root .launcher-grid--workspace, .apps-workspace .launcher-grid");
        const body = workspace?.querySelector<HTMLElement>(".workspace-body") ?? null;
        const scrollers = workspace
            ? [...workspace.querySelectorAll<HTMLElement>("*")].filter((element) => {
                const style = getComputedStyle(element);
                return ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
            }).map((element) => ({ className: element.className.toString(), tagName: element.tagName, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop }))
            : [];
        const persistedProp = workspace ? getComputedStyle(workspace).getPropertyValue("--workspace-chrome-bottom").trim() : "";
        return {
            viewport: { width: innerWidth, height: innerHeight },
            document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, scrollTop: document.documentElement.scrollTop },
            chromeBottom,
            topbar: box(topbar),
            banner: banner && isVisible(banner) ? box(banner) : null,
            search: box(search),
            workspace: workspace && workspaceRect ? {
                box: { x: workspaceRect.x, y: workspaceRect.y, width: workspaceRect.width, height: workspaceRect.height },
                presentation: workspace.getAttribute("data-presentation"),
                zIndex: workspaceStyle?.zIndex ?? null,
                topInset: workspaceStyle?.getPropertyValue("--workspace-top-inset").trim() ?? "",
                chromeBottomToken: persistedProp,
                dataConstrained: workspace.getAttribute("data-viewport-constrained"),
                scrollTop: body?.scrollTop ?? null,
                scrollHeight: body?.scrollHeight ?? null,
                clientHeight: body?.clientHeight ?? null,
                scrollers,
            } : null,
            grid: grid ? {
                box: box(grid),
                scrollWidth: grid.scrollWidth,
                clientWidth: grid.clientWidth,
                scrollHeight: grid.scrollHeight,
                clientHeight: grid.clientHeight,
                tiles: grid.querySelectorAll(".launcher-tile, .launcher-app, [data-app-id]").length,
            } : null,
            theme: document.documentElement.dataset.theme ?? null,
            homeClass: document.querySelector("main")?.className ?? null,
        };
    });
}

function getBox(value: unknown): Box | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as { x?: number; y?: number; width?: number; height?: number };
    if ([candidate.x, candidate.y, candidate.width, candidate.height].some((part) => typeof part !== "number")) return null;
    return { x: candidate.x!, y: candidate.y!, width: candidate.width!, height: candidate.height! };
}

async function setScenario(page: Page, width: number, height: number, style: Style, theme: Theme) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: theme });
    await setPreferences(page, style, theme);
    await page.goto(`${origin}/`);
    await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
    await page.locator("#search-query, .search-form input").first().waitFor({ state: "visible" });
    await settle(page);
}

async function runCoreMatrix(page: Page) {
    const scenarios: Scenario[] = [];
    const combinations = phase === "baseline"
        ? [
            { style: "zen" as const, theme: "light" as const, viewport: { width: 1440, height: 900 } },
            { style: "widgets" as const, theme: "light" as const, viewport: { width: 1440, height: 900 } },
            { style: "zen" as const, theme: "light" as const, viewport: { width: 768, height: 1024 } },
        ]
        : [ "zen", "widgets" ].flatMap((style) =>
            [ "light", "dark" ].flatMap((theme) =>
                [
                    { width: 390, height: 844 },
                    { width: 768, height: 1024 },
                    { width: 1440, height: 900 },
                ].map((viewport) => ({
                    style: style as Style,
                    theme: theme as Theme,
                    viewport,
                }))
            )
        );
    for (const { style, theme, viewport } of combinations) {
        const id = `matrix-${viewport.width}x${viewport.height}-${theme}-${style}`;
        const scenario: Scenario = { id, checks: [], screenshots: [] };
        scenarios.push(scenario);
        try {
            await setScenario(page, viewport.width, viewport.height, style, theme);
            const home = await measure(page);
            const search = getBox(home.search);
            check(scenario, "search-flow-anchor-in-viewport", Boolean(search && search.x >= -1 && search.x + search.width <= viewport.width + 1), "search input within viewport", search);
            const document = home.document as { scrollWidth: number };
            check(scenario, "document-horizontal-overflow", document.scrollWidth <= viewport.width + 1, `<=${viewport.width}`, document.scrollWidth);
            const homeScreenshot = join(screenshotsDir, `${id}-home.png`);
            await page.screenshot({ path: homeScreenshot });
            await openApps(page);
            const metrics = await measure(page);
            const workspace = metrics.workspace as { box?: unknown; presentation?: string } | null;
            const presentation = workspace?.presentation;
            const expectedPresenter = viewport.width < 768 ? "sheet" : style === "zen" ? "panel" : "window";
            check(scenario, "expected-presenter", presentation === expectedPresenter, expectedPresenter, presentation);
            const workspaceBox = getBox(workspace?.box);
            check(scenario, "workspace-present", workspaceBox !== null, "visible workspace rectangle", workspaceBox);
            if (phase === "baseline" && id === "matrix-768x1024-light-zen") {
                const chromeBottom = metrics.chromeBottom as number;
                check(scenario, "768-zen-baseline-panel-top", workspaceBox !== null && Math.abs(workspaceBox.y - 64) <= 1, 64, workspaceBox?.y, `visible chrome bottom=${chromeBottom}; banner=${JSON.stringify(metrics.banner)}`);
            }
            const panelScreenshot = join(screenshotsDir, `${id}-apps.png`);
            await page.screenshot({ path: panelScreenshot });
            scenario.metrics = { home, workspace: metrics.workspace, grid: metrics.grid };
            scenario.screenshots = [homeScreenshot, panelScreenshot];
            await Deno.writeTextFile(join(root, `${phase}-${id}.json`), JSON.stringify(scenario, null, 2));
        } catch (error) {
            scenario.error = error instanceof Error ? error.stack ?? error.message : String(error);
            failures.push(`${id}: scenario error: ${scenario.error}`);
            await Deno.writeTextFile(join(root, `${phase}-${id}.json`), JSON.stringify(scenario, null, 2));
        }
    }
    report.scenarios.push(...scenarios);
    return scenarios;
}

async function readPersistedLayout(page: Page) {
    return await page.evaluate(async () => {
        const authResponse = await fetch("/api/auth/me");
        if (!authResponse.ok) return { userId: null, layout: null };
        const auth = (await authResponse.json()).data;
        if (!auth?.user?.id) return { userId: null, layout: null };
        const key = `searcher:desktop-layout:v1:${auth.user.id}`;
        const layout = await new Promise<unknown>((resolve, reject) => {
            const open = indexedDB.open("searcher-client", 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains("state")) {
                    db.close();
                    resolve(null);
                    return;
                }
                const request = db.transaction("state", "readonly").objectStore("state").get(key);
                request.onerror = () => { db.close(); reject(request.error); };
                request.onsuccess = () => { db.close(); resolve(request.result ?? null); };
            };
        });
        return { userId: auth.user.id, layout };
    });
}
async function waitForPersistedLayout(page: Page) {
    let current = await readPersistedLayout(page);
    for (let attempt = 0; !current.layout && attempt < 30; attempt++) {
        await page.waitForTimeout(100);
        current = await readPersistedLayout(page);
    }
    return current;
}
function getPersistedAppsFrame(layout: unknown): Box | null {
    if (!layout || typeof layout !== "object" || !("windows" in layout) || !Array.isArray(layout.windows)) return null;
    const apps = layout.windows.find((window) => {
        return Boolean(window && typeof window === "object" && "id" in window && window.id === "apps");
    });
    if (!apps || typeof apps !== "object" || !("frame" in apps) || !apps.frame || typeof apps.frame !== "object") return null;
    const frame = apps.frame;
    if (!("x" in frame) || !("y" in frame) || !("width" in frame) || !("height" in frame)) return null;
    if (typeof frame.x !== "number" || typeof frame.y !== "number" || typeof frame.width !== "number" || typeof frame.height !== "number") return null;
    return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
}

async function createAuthFailurePage(context: BrowserContext, credentials: { username: string; password: string }) {
    const page = await context.newPage();
    let abortedRequests = 0;
    let abortResolve!: () => void;
    const abortSeen = new Promise<void>((resolve) => abortResolve = resolve);
    const route = async (requestRoute: Route) => {
        if (abortedRequests === 0 && requestRoute.request().method() === "GET" && new URL(requestRoute.request().url()).pathname === "/api/auth/me") {
            abortedRequests++;
            abortResolve();
            await requestRoute.abort("failed");
            return;
        }
        await requestRoute.continue();
    };
    await page.route("**/api/auth/me", route);
    await page.goto(`${origin}/login`);
    await abortSeen;
    await page.locator(".connection-banner").waitFor({ state: "visible" });
    await page.unroute("**/api/auth/me", route);
    await page.locator("#auth-username").fill(credentials.username);
    await page.locator("#auth-password").fill(credentials.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${origin}/`);
    await page.locator("main").waitFor({ state: "visible" });
    await page.locator(".connection-banner").waitFor({ state: "visible" });
    return { page, abortedRequests };
}

async function runAuthBannerScenario(credentials: { username: string; password: string }, style: Style) {
    const scenario: Scenario = { id: `real-auth-me-abort-retry-${style}`, checks: [], screenshots: [] };
    report.scenarios.push(scenario);
    const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    try {
        const authFailure = await createAuthFailurePage(context, credentials);
        const { page, abortedRequests } = authFailure;
        const bannerMetrics = await measure(page);
        const bannerBox = getBox(bannerMetrics.banner);
        check(scenario, "auth-me-network-abort-produced-real-banner", Boolean(bannerBox), "visible connection banner after intercepted GET /api/auth/me", bannerBox);
        check(scenario, "recovered-network-and-authenticated-login", abortedRequests === 1, "one failed auth/me then real login after route restoration", abortedRequests);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.emulateMedia({ colorScheme: "light" });
        await page.locator(`main.home-${style}`).waitFor({ state: "visible" });
        await page.locator("#search-query, .search-form input").first().waitFor({ state: "visible" });
        await settle(page);
        const search = page.locator("#search-query, .search-form input").first();
        const beforeSearch = await search.evaluate((element: HTMLElement) => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        await openApps(page);
        const before = await measure(page);
        const workspace = before.workspace as { box?: unknown; presentation?: string } | null;
        const actualTop = getBox(workspace?.box)?.y ?? null;
        const chromeBottom = before.chromeBottom as number;
        const expectedTop = Math.max(64, chromeBottom);
        if (style === "zen") {
            check(scenario, "presenter-top-respects-live-chrome-bottom", actualTop !== null && actualTop >= expectedTop - 1, `>=${expectedTop}`, actualTop, `chromeBottom=${chromeBottom}`);
        }
        const initialScreenshot = join(screenshotsDir, `${scenario.id}-banner.png`);
        await page.screenshot({ path: initialScreenshot });
        scenario.screenshots?.push(initialScreenshot);
        const persistedBefore = style === "widgets" && phase !== "baseline" ? await waitForPersistedLayout(page) : null;
        const canonicalBefore = persistedBefore ? getPersistedAppsFrame(persistedBefore.layout) : null;
        if (persistedBefore) {
            check(scenario, "widgets-canonical-layout-present", persistedBefore.layout !== null, "persisted canonical desktop layout", persistedBefore.layout);
            check(scenario, "widgets-app-frame-present", canonicalBefore !== null, "canonical Apps frame in persisted Widgets layout", canonicalBefore);
        }

        const retryButton = page.locator(".connection-banner").getByRole("button", { name: "重试", exact: true });
        await retryButton.waitFor({ state: "visible" });
        const authRetryResponse: Promise<Response> = page.waitForResponse((response) => response.url().endsWith("/api/auth/me") && response.status() === 200);
        await retryButton.click();
        const response = await authRetryResponse;
        await page.locator(".connection-banner").waitFor({ state: "detached" });
        check(scenario, "retry-uses-real-auth-me-success", response.status() === 200, 200, response.status());
        await settle(page);
        const after = await measure(page);
        const afterTop = getBox((after.workspace as { box?: unknown } | null)?.box)?.y ?? null;
        const baselineTop = Math.max(64, after.chromeBottom as number);
        if (style === "zen") {
            check(scenario, "banner-removal-restores-baseline-panel-top", afterTop !== null && afterTop >= baselineTop - 1 && afterTop <= baselineTop + 1, baselineTop, afterTop);
        }
        const finalSearch = getBox(after.search);
        const bannerHeight = bannerBox?.height ?? null;
        const anchorShift = finalSearch ? beforeSearch.y - finalSearch.y : null;
        const tracksBannerHeight = bannerHeight !== null && anchorShift !== null && Math.abs(anchorShift - bannerHeight) <= 1;
        const retainsHorizontalAnchor = finalSearch !== null && Math.abs(beforeSearch.x - finalSearch.x) <= 1 && Math.abs(beforeSearch.width - finalSearch.width) <= 1;
        check(scenario, "search-flow-anchor-tracks-banner-and-restores", tracksBannerHeight && retainsHorizontalAnchor, { yShift: bannerHeight, x: beforeSearch.x, width: beforeSearch.width }, { yShift: anchorShift, x: finalSearch?.x ?? null, width: finalSearch?.width ?? null });
        const finalScreenshot = join(screenshotsDir, `${scenario.id}-cleared.png`);
        await page.screenshot({ path: finalScreenshot });
        scenario.screenshots?.push(finalScreenshot);
        let canonicalAfter: { userId: string | null; layout: unknown } | null = null;
        let canonicalAfterFrame: Box | null = null;
        if (persistedBefore) {
            canonicalAfter = await readPersistedLayout(page);
            canonicalAfterFrame = getPersistedAppsFrame(canonicalAfter.layout);
            check(scenario, "widgets-canonical-frame-not-written-by-banner", canonicalBefore !== null && JSON.stringify(canonicalAfterFrame) === JSON.stringify(canonicalBefore), canonicalBefore, canonicalAfterFrame);
        }
        scenario.metrics = { withBanner: before, afterRetry: after, login: "real auth/login form", abortedRequests, canonicalBefore: persistedBefore, canonicalAfter, canonicalBeforeFrame: canonicalBefore, canonicalAfterFrame };
    } catch (error) {
        scenario.error = error instanceof Error ? error.stack ?? error.message : String(error);
        failures.push(`${scenario.id}: scenario error: ${scenario.error}`);
    } finally {
        await context.close();
    }
    await Deno.writeTextFile(join(root, `${phase}-${scenario.id}.json`), JSON.stringify(scenario, null, 2));
    return scenario;
}

async function runBoundariesAndGrid(credentials: { username: string; password: string }) {
    const context = await browser!.newContext({ viewport: { width: 900, height: 900 }, colorScheme: "light" });
    const page = await context.newPage();
    try {
        await login(page, credentials);
        const boundaryScenarios: Scenario[] = [];
        for (const width of [900, 767, 768, 1023, 1024]) {
            const style: Style = width === 767 ? "zen" : "widgets";
            const id = `boundary-${width}-${style}`;
            const scenario: Scenario = { id, checks: [], screenshots: [] };
            boundaryScenarios.push(scenario);
            await setScenario(page, width, width === 900 ? 900 : 1024, style, "light");
            await openApps(page);
            const metrics = await measure(page);
            const expectedPresenter = width < 768 ? "sheet" : style === "zen" ? "panel" : "window";
            const presentation = (metrics.workspace as { presentation?: string } | null)?.presentation;
            check(scenario, "boundary-presenter", presentation === expectedPresenter, expectedPresenter, presentation);
            check(scenario, "boundary-no-horizontal-overflow", (metrics.document as { scrollWidth: number }).scrollWidth <= width + 1, `<=${width}`, (metrics.document as { scrollWidth: number }).scrollWidth);
            scenario.metrics = metrics;
            const screenshot = join(screenshotsDir, `${id}.png`);
            await page.screenshot({ path: screenshot });
            scenario.screenshots?.push(screenshot);
            await Deno.writeTextFile(join(root, `${phase}-${id}.json`), JSON.stringify(scenario, null, 2));
        }
        report.scenarios.push(...boundaryScenarios);

        const gridScenarios: Scenario[] = [];
        for (const style of ["zen", "widgets"] as const) {
            for (const width of [320, 360, 375, 390, 414, 430]) {
                const id = `apps-grid-${width}-${style}`;
                const scenario: Scenario = { id, checks: [], screenshots: [] };
                gridScenarios.push(scenario);
                await setScenario(page, width, 844, style, "light");
                await openApps(page);
                const metrics = await measure(page);
                const grid = metrics.grid as { scrollWidth?: number; clientWidth?: number; tiles?: number } | null;
                check(scenario, "apps-grid-no-horizontal-overflow", Boolean(grid && grid.scrollWidth! <= grid.clientWidth! + 1), "grid scrollWidth <= clientWidth + 1", grid && { scrollWidth: grid.scrollWidth, clientWidth: grid.clientWidth });
                check(scenario, "apps-grid-all-seeded-tiles-present", Boolean(grid && grid.tiles! >= 20), ">=20 visible or rendered app tiles", grid?.tiles);
                check(scenario, "document-no-horizontal-overflow", (metrics.document as { scrollWidth: number }).scrollWidth <= width + 1, `<=${width}`, (metrics.document as { scrollWidth: number }).scrollWidth);
                scenario.metrics = metrics;
                const screenshot = join(screenshotsDir, `${id}.png`);
                await page.screenshot({ path: screenshot });
                scenario.screenshots?.push(screenshot);
                await Deno.writeTextFile(join(root, `${phase}-${id}.json`), JSON.stringify(scenario, null, 2));
            }
        }
        report.scenarios.push(...gridScenarios);
    } finally {
        await context.close();
    }
}

async function runShortPanelScroll(credentials: { username: string; password: string }) {
    const scenario: Scenario = { id: "short-screen-zen-panel-scroll-owner", checks: [], screenshots: [] };
    report.scenarios.push(scenario);
    const context = await browser!.newContext({ viewport: { width: 768, height: 560 }, colorScheme: "light" });
    try {
        const page = await context.newPage();
        await login(page, credentials);
        await setScenario(page, 768, 560, "zen", "light");
        await openApps(page);
        const scroller = page.locator('aside.workspace-panel[data-presentation="panel"] .workspace-body').first();
        await scroller.waitFor({ state: "visible" });
        const dimensions = await scroller.evaluate((body: HTMLElement) => ({
            clientHeight: body.clientHeight,
            scrollHeight: body.scrollHeight,
            scrollTop: body.scrollTop,
            box: (() => { const r = body.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
        }));
        const scrollPoint = {
            x: dimensions.box.x + dimensions.box.width / 2,
            y: dimensions.box.y + Math.max(8, Math.min(dimensions.box.height - 8, dimensions.box.height / 2)),
        };
        await page.mouse.move(scrollPoint.x, scrollPoint.y);
        await page.mouse.wheel(0, 480);
        await page.waitForFunction(() => {
            const body = document.querySelector<HTMLElement>('aside.workspace-panel[data-presentation="panel"] .workspace-body');
            return body !== null && body.scrollTop > 0;
        });
        const down = await scroller.evaluate((body: HTMLElement) => body.scrollTop);
        await page.mouse.wheel(0, -480);
        await page.waitForFunction(() => {
            const body = document.querySelector<HTMLElement>('aside.workspace-panel[data-presentation="panel"] .workspace-body');
            return body !== null && body.scrollTop === 0;
        });
        const up = await scroller.evaluate((body: HTMLElement) => body.scrollTop);
        const metrics = await measure(page);
        const workspace = metrics.workspace as { scrollers?: Array<unknown>; box?: unknown } | null;
        check(scenario, "short-panel-content-overflows", dimensions.scrollHeight > dimensions.clientHeight + 1, ">clientHeight", dimensions);
        check(scenario, "short-panel-wheel-scrolls-down", down > 0, ">0", down);
        check(scenario, "short-panel-wheel-scrolls-up", up === 0, 0, up);
        check(scenario, "unique-internal-vertical-scroll-owner", (workspace?.scrollers?.length ?? 0) === 1, 1, workspace?.scrollers);
        check(scenario, "short-panel-does-not-scroll-document", (metrics.document as { scrollTop: number }).scrollTop === 0, 0, (metrics.document as { scrollTop: number }).scrollTop);
        scenario.metrics = { body: dimensions, scrollPoint, down, up, workspace, document: metrics.document };
        const screenshot = join(screenshotsDir, `${scenario.id}.png`);
        await page.screenshot({ path: screenshot });
        scenario.screenshots?.push(screenshot);
    } catch (error) {
        scenario.error = error instanceof Error ? error.stack ?? error.message : String(error);
        failures.push(`${scenario.id}: scenario error: ${scenario.error}`);
    } finally {
        await context.close();
    }
    await Deno.writeTextFile(join(root, `${phase}-${scenario.id}.json`), JSON.stringify(scenario, null, 2));
}

async function runAppsRetry(credentials: { username: string; password: string }) {
    const scenario: Scenario = { id: "768x1024-apps-retry-hit-test", checks: [], screenshots: [] };
    report.scenarios.push(scenario);
    const context = await browser!.newContext({ viewport: { width: 768, height: 1024 }, colorScheme: "light" });
    try {
        const page = await context.newPage();
        await login(page, credentials);
        let abortedGets = 0;
        await page.route("**/api/webapps", async (route) => {
            if (route.request().method() === "GET") {
                abortedGets++;
                await route.abort("failed");
            } else await route.continue();
        });
        await page.reload();
        await page.locator("main").waitFor({ state: "visible" });
        await openApps(page);
        const error = page.locator(".apps-workspace-root [role=alert], .apps-workspace [role=alert]").first();
        await error.waitFor({ state: "visible" });
        const retry = error.getByRole("button", { name: "重试", exact: true });
        await retry.waitFor({ state: "visible" });
        const hitTest = await retry.evaluate((button: HTMLElement) => {
            const rect = button.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const hit = document.elementFromPoint(x, y);
            return { x, y, button: button.outerHTML, hit: hit?.outerHTML.slice(0, 240) ?? null, receivesHit: hit === button || Boolean(hit && button.contains(hit)) };
        });
        check(scenario, "apps-request-was-really-aborted", abortedGets > 0, ">0 GET /api/webapps aborts", abortedGets);
        check(scenario, "retry-center-hit-test", hitTest.receivesHit, true, hitTest);
        const errorScreenshot = join(screenshotsDir, `${scenario.id}-error.png`);
        await page.screenshot({ path: errorScreenshot });
        scenario.screenshots?.push(errorScreenshot);
        await page.unroute("**/api/webapps");
        const retryResponse = page.waitForResponse((response) => response.url().endsWith("/api/webapps") && response.request().method() === "GET" && response.status() === 200);
        await retry.click();
        const response = await retryResponse;
        await error.waitFor({ state: "hidden" });
        check(scenario, "actual-retry-click-fetches-success", response.status() === 200, 200, response.status());
        const recoveredScreenshot = join(screenshotsDir, `${scenario.id}-recovered.png`);
        await page.screenshot({ path: recoveredScreenshot });
        scenario.screenshots?.push(recoveredScreenshot);
        scenario.metrics = { abortedGets, hitTest, retryResponse: response.status(), workspace: await measure(page) };
    } catch (error) {
        scenario.error = error instanceof Error ? error.stack ?? error.message : String(error);
        failures.push(`${scenario.id}: scenario error: ${scenario.error}`);
    } finally {
        await context.close();
    }
    await Deno.writeTextFile(join(root, `${phase}-${scenario.id}.json`), JSON.stringify(scenario, null, 2));
}

async function main() {
    browser = await chromium.launch({ handleSIGTERM: false, headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    const page = await context.newPage();
    try {
        const credentials = await register(page);
        await seedApps(page);
        await setPreferences(page, "zen", "light");
        await page.goto(`${origin}/`);
        await page.locator("main").waitFor({ state: "visible" });
        if (phase === "focus") {
            await runAppsRetry(credentials);
            await setPreferences(page, "zen", "light");
            await runAuthBannerScenario(credentials, "zen");
            await setPreferences(page, "widgets", "light");
            await runAuthBannerScenario(credentials, "widgets");
        } else if (phase === "widgets-only") {
            await setPreferences(page, "widgets", "light");
            await runAuthBannerScenario(credentials, "widgets");
        } else {
            await runCoreMatrix(page);
            if (phase === "full") {
                await runBoundariesAndGrid(credentials);
                await runShortPanelScroll(credentials);
                await runAppsRetry(credentials);
                await setPreferences(page, "zen", "light");
                await runAuthBannerScenario(credentials, "zen");
                await setPreferences(page, "widgets", "light");
                await runAuthBannerScenario(credentials, "widgets");
            }
        }
    } finally {
        await context.close();
        await browser.close();
    }
    report.finishedAt = new Date().toISOString();
    report.failures = failures;
    report.status = failures.length === 0 ? "pass" : "fail";
    await Deno.writeTextFile(join(root, `${phase}-results.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ phase, status: report.status, failures, resultFile: join(root, `${phase}-results.json`), scenarios: report.scenarios.length }, null, 2));
    if (phase !== "baseline" && failures.length > 0) Deno.exitCode = 1;
}

await main();
