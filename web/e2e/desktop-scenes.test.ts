import { assert, assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

type Rect = { x: number; y: number; width: number; height: number };
type Rectangles = Record<string, Rect | null>;
type CarTransform = string | null;

const RECT_SELECTORS = {
    app: ".app-shell",
    home: "main.home-widgets",
    wallpaper: '[data-testid="home-wallpaper-surface"]',
    header: ".topbar",
    dock: ".desktop-dock",
};
const APPS_DOCK_BUTTON = '.desktop-dock button[data-workspace="apps"]';
const SCENE_HOST = '[data-testid="desktop-scene-host"]';

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

async function patchAppearance(
    page: Page,
    appearance: Record<string, unknown>,
) {
    const result = await page.evaluate(async (appearance) => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(appearance),
        });
        return {
            ok: response.ok,
            status: response.status,
            body: await response.text(),
        };
    }, appearance);
    assert(
        result.ok,
        `PATCH /api/preferences failed (${result.status}): ${result.body}`,
    );
}

async function readRectangles(page: Page): Promise<Rectangles> {
    return await page.evaluate((selectors) => {
        const rectangles: Record<string, Rect | null> = {};
        for (const [name, selector] of Object.entries(selectors)) {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) {
                rectangles[name] = null;
                continue;
            }
            const rect = element.getBoundingClientRect();
            rectangles[name] = {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            };
        }
        return rectangles;
    }, RECT_SELECTORS);
}

function assertSameRectangles(before: Rectangles, after: Rectangles) {
    for (const name of Object.keys(RECT_SELECTORS)) {
        const previous = before[name];
        const current = after[name];
        assert(previous && current, `Expected ${name} to remain measurable`);
        for (const key of ["x", "y", "width", "height"] as const) {
            assert(
                Math.abs(previous[key] - current[key]) <= 0.75,
                `${name}.${key} changed from ${previous[key]} to ${
                    current[key]
                }px`,
            );
        }
    }
}

async function isPointerHit(page: Page, selector: string): Promise<boolean> {
    return await page.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
        );
        return !!hit && (hit === element || element.contains(hit));
    });
}

async function readCarTransforms(page: Page): Promise<CarTransform[]> {
    return await page.locator("[data-scene-car]").evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("transform"))
    );
}

async function waitForCarMovement(
    page: Page,
    previous: CarTransform[],
): Promise<CarTransform[]> {
    await page.waitForFunction((previous) => {
        const transforms = Array.from(
            document.querySelectorAll<SVGGElement>("[data-scene-car]"),
        ).map((element) => element.getAttribute("transform"));
        return transforms.length === previous.length &&
            transforms.some((transform, index) =>
                transform !== previous[index]
            );
    }, previous);
    return await readCarTransforms(page);
}

function carPosition(transform: CarTransform): { x: number; y: number } {
    const match = transform?.match(
        /^translate\(([-+.\deE]+)\s+([-+.\deE]+)\) rotate\(([-+.\deE]+)\)$/,
    );
    assert(match, `Unexpected coaster car transform: ${transform}`);
    return { x: Number(match[1]), y: Number(match[2]) };
}

function assertResumeDidNotJump(
    before: CarTransform[],
    after: CarTransform[],
) {
    assertEquals(after.length, before.length);
    for (let index = 0; index < before.length; index++) {
        const from = carPosition(before[index]);
        const to = carPosition(after[index]);
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        assert(
            distance <= 8,
            `Coaster car ${index} jumped ${
                distance.toFixed(2)
            } SVG units on resume`,
        );
    }
}

async function setDocumentVisibility(page: Page, state: "visible" | "hidden") {
    await page.evaluate((state) => {
        const testDocument = document as Document & {
            __desktopSceneTestVisibility?: DocumentVisibilityState;
        };
        if (!Object.hasOwn(document, "__desktopSceneTestVisibility")) {
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                get: () =>
                    testDocument.__desktopSceneTestVisibility ?? "visible",
            });
        }
        testDocument.__desktopSceneTestVisibility = state;
        document.dispatchEvent(new Event("visibilitychange"));
    }, state);
}

Deno.test("desktop scenes load on selection and respect host lifecycle", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "desktop_scenes_lifecycle",
        password: "Desktop-scenes-182!",
        displayName: "Desktop scenes",
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
        reducedMotion: "no-preference",
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    const requestedJs = new Set<string>();
    page.on("request", (request) => {
        const url = new URL(request.url());
        if (
            url.origin === app.origin &&
            url.pathname.startsWith("/assets/") &&
            url.pathname.endsWith(".js")
        ) {
            requestedJs.add(url.pathname);
        }
    });

    await loginAndVisit(page, app.origin, "/", credentials);
    assertEquals(await page.locator(SCENE_HOST).count(), 0);
    await patchAppearance(page, { style: "widgets", theme: "light" });
    await page.reload();
    await page.locator("main.home-widgets").waitFor({ state: "visible" });
    await page.locator(".desktop-dock").waitFor({ state: "visible" });
    assertEquals(await page.locator(SCENE_HOST).count(), 0);
    await stableLayout(page);

    const initialJs = new Set(requestedJs);
    const before = await readRectangles(page);
    await page.locator(APPS_DOCK_BUTTON).focus();
    assertEquals(
        await page.locator(APPS_DOCK_BUTTON).evaluate((button) =>
            button === document.activeElement
        ),
        true,
    );
    const pointerBefore = await isPointerHit(page, APPS_DOCK_BUTTON);
    assertEquals(pointerBefore, true);

    await patchAppearance(page, { desktopScene: "amusement-park" });
    await page.reload();
    const host = page.locator(SCENE_HOST);
    await host.waitFor({ state: "visible" });
    await page.locator("svg.scene-park").waitFor({ state: "visible" });
    await page.locator(".desktop-dock").waitFor({ state: "visible" });
    await stableLayout(page);

    // The complete vertical composition must survive wide CSS viewports
    // (including zoomed-out browsers) and both sides of the compact boundary.
    for (const width of [390, 640, 641, 1920, 2400]) {
        await page.setViewportSize({ width, height: 900 });
        await stableLayout(page);
        const bounds = await page.locator("svg.scene-park").evaluate((svg) => {
            const element = svg as SVGSVGElement;
            const matrix = element.getScreenCTM()!;
            const box = element.viewBox.baseVal;
            const host = element.parentElement!.getBoundingClientRect();
            return {
                top: box.y * matrix.d + matrix.f,
                bottom: (box.y + box.height) * matrix.d + matrix.f,
                hostTop: host.top,
                hostBottom: host.bottom,
            };
        });
        assert(
            bounds.top >= bounds.hostTop - 0.75,
            `Scene top clipped at ${width}px: ${JSON.stringify(bounds)}`,
        );
        assert(
            bounds.bottom <= bounds.hostBottom + 0.75,
            `Scene bottom clipped at ${width}px: ${JSON.stringify(bounds)}`,
        );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await stableLayout(page);

    const sceneChunk = [...requestedJs].find((file) =>
        /\/AmusementParkScene-[^/]+\.js$/.test(file)
    );
    assert(sceneChunk, "Selecting the scene must load its dedicated JS chunk");
    assertEquals(initialJs.has(sceneChunk), false);
    assertEquals(await host.getAttribute("aria-hidden"), "true");
    assertEquals(await host.getAttribute("data-scene"), "amusement-park");
    assertEquals(
        await host.evaluate((element) =>
            getComputedStyle(element).pointerEvents
        ),
        "none",
    );
    assertEquals(
        await host.getAttribute("data-motion"),
        "full",
    );
    assertEquals(await host.getAttribute("data-paused"), null);

    const after = await readRectangles(page);
    assertSameRectangles(before, after);
    await page.locator(APPS_DOCK_BUTTON).focus();
    assertEquals(
        await page.locator(APPS_DOCK_BUTTON).evaluate((button) =>
            button === document.activeElement
        ),
        true,
    );
    assertEquals(await isPointerHit(page, APPS_DOCK_BUTTON), pointerBefore);

    const initialCars = await readCarTransforms(page);
    assertEquals(initialCars.length, 3);
    const flagMotion = await page.locator(".scene-park .sp-flag").first()
        .evaluate(
            (element) => {
                const style = getComputedStyle(element);
                return {
                    animationName: style.animationName,
                    playState: style.animationPlayState,
                };
            },
        );
    assert(flagMotion.animationName !== "none");
    assertEquals(flagMotion.playState, "running");
    await waitForCarMovement(page, initialCars);

    await setDocumentVisibility(page, "hidden");
    await page.waitForFunction(() =>
        document.querySelector("[data-testid='desktop-scene-host']")
            ?.getAttribute(
                "data-paused",
            ) === "true"
    );
    const hiddenCars = await readCarTransforms(page);
    const hiddenFlagMotion = await page.locator(".scene-park .sp-flag")
        .first().evaluate(
            (element) => getComputedStyle(element).animationPlayState,
        );
    assertEquals(hiddenFlagMotion, "paused");
    await page.waitForTimeout(120);
    assertEquals(await readCarTransforms(page), hiddenCars);

    await setDocumentVisibility(page, "visible");
    await page.waitForFunction(() =>
        document.querySelector("[data-testid='desktop-scene-host']")
            ?.hasAttribute(
                "data-paused",
            ) === false
    );
    const resumedCars = await readCarTransforms(page);
    assertResumeDidNotJump(hiddenCars, resumedCars);
    assertEquals(
        await page.locator(".scene-park .sp-flag").first().evaluate(
            (element) => getComputedStyle(element).animationPlayState,
        ),
        "running",
    );
    await waitForCarMovement(page, resumedCars);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => {
        const host = document.querySelector<HTMLElement>(
            "[data-testid='desktop-scene-host']",
        );
        return host?.getAttribute("data-motion") === "reduced" &&
            host.getAttribute("data-paused") === "true";
    });
    const reducedCars = await readCarTransforms(page);
    const reducedFlagAnimation = await page.locator(
        ".scene-park .sp-flag",
    ).first().evaluate((element) => getComputedStyle(element).animationName);
    assertEquals(reducedFlagAnimation, "none");
    await page.waitForTimeout(120);
    assertEquals(await readCarTransforms(page), reducedCars);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(() => {
        const host = document.querySelector<HTMLElement>(
            "[data-testid='desktop-scene-host']",
        );
        return host?.getAttribute("data-motion") === "full" &&
            !host.hasAttribute("data-paused");
    });
    const motionRestoredCars = await readCarTransforms(page);
    assertResumeDidNotJump(reducedCars, motionRestoredCars);
    const restoredFlagMotion = await page.locator(
        ".scene-park .sp-flag",
    ).first().evaluate((element) => {
        const style = getComputedStyle(element);
        return {
            animationName: style.animationName,
            playState: style.animationPlayState,
        };
    });
    assert(restoredFlagMotion.animationName !== "none");
    assertEquals(restoredFlagMotion.playState, "running");
    await waitForCarMovement(page, motionRestoredCars);

    await page.locator('a[aria-label="AI 问答"]').click();
    await page.waitForURL(`${app.origin}/ask`);
    await host.waitFor({ state: "detached" });
    assertEquals(await page.locator("svg.scene-park").count(), 0);
});

Deno.test("desktop scene selection persists per device/account and retries failed cloud writes", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "scene_sync",
        password: "Desktop-scenes-182!",
    });
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({ reducedMotion: "reduce" });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    await page.goto(app.origin + "/settings/appearance");
    const scenes = page.getByRole("radiogroup", { name: "动态桌面场景" });
    const park = scenes.getByRole("radio", { name: "动态游乐场", exact: true });
    const off = scenes.getByRole("radio", { name: "关闭", exact: true });
    await off.waitFor({ state: "visible" });
    await off.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() =>
        document.querySelector(
            '[role="radiogroup"][aria-label="动态桌面场景"] [role="radio"][aria-label="动态游乐场"]',
        )?.getAttribute("aria-checked") === "true"
    );
    assertEquals(await park.getAttribute("aria-checked"), "true");
    await page.reload();
    await park.waitFor({ state: "visible" });
    assertEquals(await park.getAttribute("aria-checked"), "true");
    await loginAndVisit(page, app.origin, "/settings/appearance", credentials);
    await off.waitFor({ state: "visible" });
    await page.waitForFunction(() =>
        document.querySelector(
            '[role="radiogroup"][aria-label="动态桌面场景"] [role="radio"][aria-checked="true"]',
        )?.textContent?.includes("关闭")
    );

    await page.route("**/api/preferences", async (route) => {
        if (route.request().method() !== "PATCH") return await route.continue();
        await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
                code: 503,
                status: false,
                message: "Unavailable",
            }),
        });
    });
    await park.click();
    const retry = page.locator(".connection-banner").getByRole("button", {
        name: "重试",
    });
    await retry.waitFor({ state: "visible" });
    assertEquals(
        await page.evaluate(async () =>
            (await (await fetch("/api/preferences")).json()).data.desktopScene
        ),
        "none",
    );
    await page.unroute("**/api/preferences");
    const saved = page.waitForResponse((response) =>
        response.url().endsWith("/api/preferences") &&
        response.request().method() === "PATCH" && response.ok()
    );
    await retry.click();
    await saved;
    await retry.waitFor({ state: "detached" });
    await page.reload();
    await park.waitFor({ state: "visible" });
    assertEquals(await park.getAttribute("aria-checked"), "true");

    const otherDevice = await browser.newContext();
    cleanup.defer(() => otherDevice.close());
    const otherPage = await otherDevice.newPage();
    await loginAndVisit(otherPage, app.origin, "/", credentials);
    await otherPage.locator(".scene-park").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /用户菜单/ }).click();
    await page.getByRole("menuitem", { name: "退出登录" }).click();
    await page.getByRole("link", { name: "登录", exact: true }).waitFor({
        state: "visible",
    });
    await page.goto(app.origin + "/settings/appearance");
    await park.waitFor({ state: "visible" });
    assertEquals(await park.getAttribute("aria-checked"), "true");
    const registration = await page.request.post(
        app.origin + "/api/auth/register",
        {
            headers: { origin: app.origin },
            data: {
                username: "scene_other",
                displayName: "Other",
                password: "Desktop-scenes-182!",
            },
        },
    );
    assertEquals(registration.status(), 200);
    await page.reload();
    await off.waitFor({ state: "visible" });
    assertEquals(await off.getAttribute("aria-checked"), "true");
});
