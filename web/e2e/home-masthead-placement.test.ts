import { assert, assertEquals } from "@std/assert";
import {
    boxOf,
    createHomeNote,
    intersects,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

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

                const pill = masthead.locator(".home-masthead__pill");
                await pill.waitFor({ state: "visible" });
                assertEquals(
                    await pill.locator(".home-masthead__pill-tasks")
                        .textContent(),
                    "1 项待办",
                );

                // Expand by tapping the pill, collapse with Escape.
                await pill.click();
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
                // Escape hands focus back to the pill.
                assertEquals(
                    await pill.evaluate((el) => el === document.activeElement),
                    true,
                );

                // The open sheet slides the search box down below it without
                // moving the hero; focusing the box closes the sheet and the
                // box returns, focused, to its anchor.
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
                await pill.click();
                const sheet = page.locator(
                    '.home-masthead__sheet[data-open="true"]',
                );
                await sheet.waitFor({ state: "visible" });
                // Wait for the slide to settle below the sheet.
                await page.waitForFunction(() => {
                    const box = document.querySelector(".search-form-wrap")
                        ?.getBoundingClientRect();
                    const sheetBox = document.querySelector(
                        ".home-masthead__sheet",
                    )?.getBoundingClientRect();
                    return box !== undefined && sheetBox !== undefined &&
                        box.top >= sheetBox.bottom &&
                        box.bottom <= innerHeight;
                });
                assertEquals(
                    await page.locator(".hero").boundingBox(),
                    heroBefore,
                );
                await page.getByRole("combobox").first().focus();
                await page.waitForFunction(() =>
                    document.querySelector(".home-masthead")?.getAttribute(
                        "data-collapsed",
                    ) === "true"
                );
                await page.waitForFunction((anchorY) => {
                    const box = document.querySelector(".search-form-wrap")
                        ?.getBoundingClientRect();
                    return box !== undefined && Math.abs(box.top - anchorY) < 1;
                }, anchored.y);
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
