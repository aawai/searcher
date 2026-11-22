import { assert, assertEquals } from "@std/assert";
import {
    boxOf,
    createHomeNote,
    intersects,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import { hitSize } from "./helpers/touch-target.ts";

Deno.test("masthead placement: side follows wallpaper focalX at 1440 and narrow mode collapses by default at 390 with tap/swipe expand and preference support", async (t) => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
        hasTouch: true,
    });
    const { page, app } = fixture;
    try {
        await createHomeNote(page, {
            title: "置顶条目",
            body: "- [ ] 第一项待办\n\n正文摘要。",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);

        const masthead = page.locator(".home-masthead");

        await t.step(
            "at 1440x900, default focalX (0.5) places masthead on the left, focalX < 0.5 moves it to the right, without intersecting search",
            async () => {
                assertEquals(await masthead.getAttribute("data-mode"), "side");
                assertEquals(await masthead.getAttribute("data-side"), "left");
                const leftBox = await boxOf(page, ".home-masthead__column");
                const searchBox = await boxOf(page, ".search-form-wrap");
                assert(leftBox && searchBox);
                assert(!intersects(leftBox, searchBox));
                assert(leftBox.x + leftBox.width <= searchBox.x - 32 + 1);

                // Set wallpaper with focalX = 0.25 (subject on left -> masthead on right).
                const wallpaperUrl = "https://example.com/subject-left.jpg";
                await page.evaluate(async (url) => {
                    const res = await fetch("/api/preferences", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            backgroundImage: url,
                            wallpaperPresentations: {
                                [url]: {
                                    composition: { focalX: 0.25, focalY: 0.5 },
                                    readability: "balanced",
                                },
                            },
                        }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                }, wallpaperUrl);
                await reloadHome(page);
                await waitForNoteCards(page, 1);
                assertEquals(await masthead.getAttribute("data-mode"), "side");
                assertEquals(await masthead.getAttribute("data-side"), "right");
                const rightBox = await boxOf(page, ".home-masthead__column");
                const searchBoxAfter = await boxOf(page, ".search-form-wrap");
                assert(rightBox && searchBoxAfter);
                assert(!intersects(rightBox, searchBoxAfter));
                assert(
                    rightBox.x >= searchBoxAfter.x + searchBoxAfter.width + 31,
                );
            },
        );

        await t.step(
            "at 390x844, narrow mode is collapsed by default, expands by tap and swipe, and honours homeMastheadCollapsed preference",
            async () => {
                await page.setViewportSize({ width: 390, height: 844 });
                await reloadHome(page);
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-mode",
                    ) === "narrow"
                );
                assertEquals(
                    await masthead.getAttribute("data-collapsed"),
                    "true",
                );

                // Collapsed, the masthead peeks at the top: only the date
                // block shows, the open task count rides on its last line,
                // and the peek itself is the expand control.
                const peek = masthead.locator(".home-masthead__peek");
                await peek.waitFor({ state: "visible" });
                assertEquals(
                    await masthead.locator(".home-masthead__peek-tasks")
                        .textContent(),
                    "1 项待办",
                );
                assertEquals(
                    await peek.getAttribute("aria-label"),
                    "展开首页刊头，1 项待办",
                );
                const peekBox = await peek.boundingBox();
                const dayBox = await masthead.locator(".home-masthead__day")
                    .boundingBox();
                const searchAnchor = await boxOf(page, ".search-form-wrap");
                assert(peekBox && dayBox && searchAnchor);
                assert(peekBox.y + peekBox.height <= searchAnchor.y);
                assert(dayBox.y >= peekBox.y);
                assert(dayBox.y + dayBox.height <= peekBox.y + peekBox.height);

                // Expand by tapping the peek, collapse with Escape.
                await peek.click();
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-collapsed",
                    ) === "false"
                );
                await page.locator('.home-masthead__sheet[data-open="true"]')
                    .waitFor({
                        state: "visible",
                    });
                await waitForNoteCards(page, 1);

                await page.keyboard.press("Escape");
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-collapsed",
                    ) === "true"
                );
                // Escape hands focus back to the peek.
                assertEquals(
                    await peek.evaluate((el) => el === document.activeElement),
                    true,
                );

                // The open sheet slides the search box down below it without
                // moving the hero; focusing the box closes the sheet and the
                // box, focused, rises above its resting anchor so suggestions
                // clear the soft keyboard.
                const searchWrap = page.locator(".search-form-wrap");
                // The Escape above slid the box back; measure once it settled.
                await searchWrap.evaluate((element) =>
                    Promise.all(
                        element.getAnimations().map((animation) =>
                            animation.finished
                        ),
                    )
                );
                const anchored = await searchWrap.boundingBox();
                const heroBefore = await page.locator(".hero").boundingBox();
                assert(anchored && heroBefore);
                await peek.click();
                const sheet = page.locator(
                    '.home-masthead__sheet[data-open="true"]',
                );
                await sheet.waitFor({ state: "visible" });
                // Docked: the box sits the 16px page margin above the Dock,
                // below the sheet, with its slide and the sheet settled.
                const settleDock = () =>
                    page.waitForFunction(() => {
                        const wrap = document.querySelector(
                            ".search-form-wrap",
                        );
                        const sheetElement = document.querySelector(
                            ".home-masthead__sheet",
                        );
                        const dock = document.querySelector(".dock-bar")
                            ?.getBoundingClientRect();
                        if (!wrap || !sheetElement || !dock) return false;
                        const box = wrap.getBoundingClientRect();
                        const moving = [
                            wrap,
                            sheetElement,
                            document.querySelector(".hero"),
                        ].some((element) =>
                            (element?.getAnimations().length ?? 0) > 0
                        );
                        return !moving &&
                            box.top >= sheetElement.getBoundingClientRect()
                                    .bottom &&
                            Math.abs(box.bottom - (dock.top - 16)) < 1;
                    });
                // Wait for the slide to settle between the sheet and the Dock.
                await settleDock();
                assertEquals(
                    await page.locator(".hero").boundingBox(),
                    heroBefore,
                );
                // The open sheet is not modal: the Dock stays hit-testable.
                assertEquals(
                    await page.evaluate(() => {
                        const item = document.querySelector(
                            '.dock-bar [aria-label^="设置"]',
                        )!.getBoundingClientRect();
                        return document.elementFromPoint(
                            item.x + item.width / 2,
                            item.y + item.height / 2,
                        )?.closest(".dock-bar") !== null;
                    }),
                    true,
                );
                // The viewport height changes while the sheet is open (soft
                // keyboard, browser toolbar): the box re-docks above the Dock
                // from its moved anchor instead of a stale one.
                await page.setViewportSize({ width: 390, height: 600 });
                await settleDock();
                await page.setViewportSize({ width: 390, height: 844 });
                await settleDock();
                await page.getByRole("combobox").first().focus();
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-collapsed",
                    ) === "true"
                );
                // Top bar height + clamp(64px, 16dvh, 140px).
                const topbarBottom = await page.evaluate(() =>
                    document.querySelector(".topbar")?.getBoundingClientRect()
                        .bottom ?? 56
                );
                const engagedY = topbarBottom +
                    Math.min(140, Math.max(64, 844 * 0.16));
                await page.waitForFunction((engagedY) => {
                    const box = document.querySelector(".search-form-wrap")
                        ?.getBoundingClientRect();
                    return box !== undefined &&
                        Math.abs(box.top - engagedY) < 1;
                }, engagedY);
                assert(engagedY < anchored.y);
                assertEquals(
                    await page.evaluate(() =>
                        document.activeElement?.closest(".search-form-wrap") !==
                            null
                    ),
                    true,
                );

                // Expand by touch swipe down on the blank home area, collapse by swipe up.
                const session = await page.context().newCDPSession(page);
                await session.send("Input.dispatchTouchEvent", {
                    type: "touchStart",
                    touchPoints: [{ x: 195, y: 500 }],
                });
                await session.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{ x: 195, y: 580 }],
                });
                await session.send("Input.dispatchTouchEvent", {
                    type: "touchEnd",
                    touchPoints: [],
                });
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-collapsed",
                    ) === "false"
                );

                await session.send("Input.dispatchTouchEvent", {
                    type: "touchStart",
                    touchPoints: [{ x: 195, y: 580 }],
                });
                await session.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{ x: 195, y: 500 }],
                });
                await session.send("Input.dispatchTouchEvent", {
                    type: "touchEnd",
                    touchPoints: [],
                });
                await session.detach();
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-collapsed",
                    ) === "true"
                );

                // Turn off "窄屏默认收起刊头" in settings -> narrow mode starts expanded on reload.
                await page.goto(app.origin + "/settings/appearance");
                const toggle = page.getByRole("switch", {
                    name: "窄屏默认收起刊头",
                    exact: true,
                });
                await toggle.waitFor({ state: "visible" });
                assertEquals(await toggle.getAttribute("aria-checked"), "true");
                const saved = page.waitForResponse((response) =>
                    response.url().endsWith("/api/preferences") &&
                    response.request().method() === "PATCH" &&
                    response.ok()
                );
                await toggle.click();
                await saved;

                await page.goto(app.origin + "/");
                await page.waitForFunction(() => {
                    const el = document.querySelector(".home-masthead");
                    return el?.getAttribute("data-mode") === "narrow" &&
                        el.getAttribute("data-collapsed") === "false";
                });
                await waitForNoteCards(page, 1);
            },
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("masthead overflow: a long pinned list fades at the bottom on first paint and 全部笔记 stays visible in side and narrow modes", async (t) => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page, app } = fixture;
    const total = 8;
    try {
        for (let index = 0; index < total; index++) {
            await createHomeNote(page, {
                title: `置顶 ${index + 1}`,
                body: `- [ ] 待办 ${index + 1}\n\n第 ${
                    index + 1
                } 篇的正文摘要。`,
                homeSortOrder: index,
            });
        }
        await reloadHome(page);
        await waitForNoteCards(page, total);

        /** The link is painted on top at its centre and inside `container`. */
        const assertAllNotesVisible = async (container: string) => {
            const link = await boxOf(page, ".home-masthead__all-notes");
            const area = await boxOf(page, container);
            assert(link && area);
            assert(link.y >= area.y - 1);
            assert(link.y + link.height <= area.y + area.height + 1);
            assertEquals(
                await page.evaluate(
                    ({ x, y }) =>
                        document.elementFromPoint(x, y)?.closest(
                            ".home-masthead__all-notes",
                        ) !== null,
                    {
                        x: link.x + link.width / 2,
                        y: link.y + link.height / 2,
                    },
                ),
                true,
            );
        };

        await t.step(
            "side mode: the scroll area reports bottom overflow without any scroll or resize, and the footer sits outside it",
            async () => {
                await page.waitForFunction(
                    () =>
                        document.querySelector(".home-masthead__scroll")
                            ?.getAttribute("data-overflow-bottom") === "true",
                    undefined,
                    { timeout: 5000 },
                );
                const scroll = await boxOf(page, ".home-masthead__scroll");
                const link = await boxOf(page, ".home-masthead__all-notes");
                assert(scroll && link);
                assert(link.y >= scroll.y + scroll.height - 1);
                await assertAllNotesVisible(".home-masthead__column");
            },
        );

        await t.step(
            "narrow mode: the open sheet keeps 全部笔记 visible above the docked search box",
            async () => {
                await page.setViewportSize({ width: 390, height: 844 });
                await reloadHome(page);
                const peek = page.locator(".home-masthead__peek");
                await peek.click();
                await page.locator('.home-masthead__sheet[data-open="true"]')
                    .waitFor({ state: "visible" });
                await page.locator(".home-masthead__sheet").evaluate((
                    element,
                ) => Promise.all(
                    element.getAnimations().map((animation) =>
                        animation.finished
                    ),
                ));
                await waitForNoteCards(page, total);
                await assertAllNotesVisible(".home-masthead__sheet");
            },
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("masthead targets, narrow day scale/short landscape peek, and opaque veil width boundaries", async (t) => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page, app } = fixture;
    try {
        await createHomeNote(page, {
            title: "命令笔记",
            body: "```bash\necho hello\n```",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);

        await t.step(
            "Issue 3: fine-pointer hit target size >= 24px for all-notes and copy-btn",
            async () => {
                const allNotesHit = await hitSize(
                    page.locator(".home-masthead__all-notes"),
                );
                const copyBtnHit = await hitSize(
                    page.locator(".home-masthead__copy-btn"),
                );
                assert(
                    allNotesHit.width >= 24 && allNotesHit.height >= 24,
                    `all-notes hit too small: ${JSON.stringify(allNotesHit)}`,
                );
                assert(
                    copyBtnHit.width >= 24 && copyBtnHit.height >= 24,
                    `copy-btn hit too small: ${JSON.stringify(copyBtnHit)}`,
                );
            },
        );

        await t.step(
            "Issue 5: side veil spans 320px past column in translucent glass, and stops as a crisp 1px-bordered solid band within 24px under opaque conditions",
            async () => {
                const column = await boxOf(page, ".home-masthead__column");
                const search = await boxOf(page, ".search-form-wrap");
                assert(column && search);

                // Translucent regular glass keeps the 320px smooth veil.
                const regularVeil = await boxOf(page, ".home-masthead__veil");
                assert(regularVeil);
                assert(
                    regularVeil.width >= column.x + column.width + 319 &&
                        regularVeil.width <= column.x + column.width + 340,
                    `expected translucent veil ~column+320, got ${regularVeil.width}`,
                );

                const assertOpaqueConstrained = async (label: string) => {
                    const veil = await boxOf(page, ".home-masthead__veil");
                    assert(veil, `${label}: veil missing`);
                    assert(
                        veil.x + veil.width <= column.x + column.width + 25,
                        `${label}: opaque veil (${
                            veil.x + veil.width
                        }) exceeded 24px padding past column (${
                            column.x + column.width
                        })`,
                    );
                    assert(
                        !intersects(veil, search),
                        `${label}: opaque veil overlapped search box`,
                    );
                    const veilStyles = await page.locator(
                        ".home-masthead__veil",
                    ).evaluate((el) => {
                        const cs = getComputedStyle(el);
                        return {
                            maskImage: cs.maskImage,
                            borderRightWidth: cs.borderRightWidth,
                        };
                    });
                    assertEquals(
                        veilStyles.maskImage,
                        "none",
                        `${label}: expected no feather mask on opaque veil`,
                    );
                    assertEquals(
                        veilStyles.borderRightWidth,
                        "1px",
                        `${label}: expected 1px crisp border on opaque veil`,
                    );
                };

                // 1. glass=off
                await page.evaluate(async () => {
                    const res = await fetch("/api/preferences", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ glassIntensity: "off" }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                });
                await reloadHome(page);
                await waitForNoteCards(page, 1);
                await page.waitForFunction(() =>
                    document.documentElement.dataset.glass === "off"
                );
                await assertOpaqueConstrained("glass=off");

                // Restore regular glass, test data-contrast="more"
                await page.evaluate(async () => {
                    const res = await fetch("/api/preferences", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            glassIntensity: "regular",
                            theme: "high-contrast-light",
                        }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                });
                await reloadHome(page);
                await waitForNoteCards(page, 1);
                await page.waitForFunction(() =>
                    document.documentElement.dataset.glass === "regular" &&
                    document.documentElement.dataset.contrast === "more"
                );
                await assertOpaqueConstrained("high-contrast-light");

                // Restore normal light theme, test prefers-reduced-transparency
                await page.evaluate(async () => {
                    const res = await fetch("/api/preferences", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ theme: "light" }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                });
                await reloadHome(page);
                await waitForNoteCards(page, 1);
                await page.waitForFunction(() =>
                    document.documentElement.dataset.contrast !== "more"
                );
                const cdp = await page.context().newCDPSession(page);
                await cdp.send("Emulation.setEmulatedMedia", {
                    features: [{
                        name: "prefers-reduced-transparency",
                        value: "reduce",
                    }],
                });
                await assertOpaqueConstrained("reduced-transparency");
                await cdp.send("Emulation.setEmulatedMedia", {
                    features: [{
                        name: "prefers-reduced-transparency",
                        value: "no-preference",
                    }],
                });
                await cdp.detach();

                // Test forced-colors: active
                await page.emulateMedia({ forcedColors: "active" });
                await assertOpaqueConstrained("forced-colors");
                await page.emulateMedia({ forcedColors: "none" });
            },
        );

        await t.step(
            "Issue 4: >=768px narrow mode (1024x768 with right Dock) uses 88px/72px day scale and ultra-short 844x390 hides collapsed peek",
            async () => {
                await page.locator(
                    'button[data-dock-action="menu"], button[aria-label="任务栏选项"]',
                ).click();
                await page.getByRole("menuitem", { name: "管理任务栏" })
                    .click();
                const dockModal = page.locator(
                    '[data-dock-modal="management"]',
                );
                await dockModal.waitFor({ state: "visible" });
                await dockModal.getByRole("radio", {
                    name: "右侧",
                    exact: true,
                }).click();
                await dockModal.getByRole("button", { name: "关闭" }).click();
                await dockModal.waitFor({ state: "hidden" });
                await page.locator(
                    '.app-shell[data-dock-edge="right"], .dock-container[data-edge="right"]',
                ).first().waitFor();

                await page.setViewportSize({ width: 1024, height: 768 });
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-mode",
                    ) === "narrow"
                );
                const dayMetrics = await page.locator(".home-masthead__day")
                    .evaluate((el) => {
                        const style = getComputedStyle(el);
                        return {
                            fontSize: style.fontSize,
                            lineHeight: style.lineHeight,
                        };
                    });
                assertEquals(dayMetrics, {
                    fontSize: "88px",
                    lineHeight: "72px",
                });

                // Tight narrow peek: --peek-fade-tail shrinks so the 17 day
                // glyph baseline stays opaque instead of fading into 16px.
                const tight = await page.evaluate(() => {
                    const sheet = document.querySelector(
                        ".home-masthead__sheet",
                    );
                    const block = document.querySelector(
                        ".home-masthead__content > :first-child",
                    );
                    if (!sheet || !block) return null;
                    return {
                        sheetHeight: sheet.getBoundingClientRect().height,
                        blockHeight: Math.ceil(
                            block.getBoundingClientRect().height,
                        ),
                        fadeTail: parseFloat(
                            getComputedStyle(sheet).getPropertyValue(
                                "--peek-fade-tail",
                            ),
                        ),
                    };
                });
                assert(tight);
                assert(tight.sheetHeight >= tight.blockHeight);
                assert(
                    tight.sheetHeight - tight.fadeTail >= tight.blockHeight,
                    `fade tail ${tight.fadeTail} entered block ${tight.blockHeight} (sheet ${tight.sheetHeight})`,
                );

                // Ultra-short landscape (844x390): peek cannot fit above search -> hidden cleanly.
                await page.setViewportSize({ width: 844, height: 390 });
                await page.waitForFunction(() => {
                    const masthead = document.querySelector(".home-masthead");
                    const sheet = document.querySelector(
                        ".home-masthead__sheet",
                    );
                    return masthead?.getAttribute("data-peek-hidden") ===
                            "true" &&
                        sheet !== null &&
                        getComputedStyle(sheet).opacity === "0";
                });
                assertEquals(
                    await page.locator(".home-masthead__peek").count(),
                    0,
                );
            },
        );

        await t.step("guest home renders masthead without dek", async () => {
            const guestContext = await page.context().browser()!.newContext({
                viewport: { width: 1440, height: 900 },
            });
            try {
                const guestPage = await guestContext.newPage();
                await guestPage.goto(app.origin + "/");
                await guestPage.locator(".home-masthead__header").waitFor({
                    state: "visible",
                });
                assertEquals(
                    await guestPage.locator(".home-masthead__dek").count(),
                    0,
                );
            } finally {
                await guestContext.close();
            }
        });
    } finally {
        await fixture.close();
    }
});
