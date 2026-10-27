import { assert, assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    measureHomeNotes,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import { libraryPanel } from "./helpers/library.ts";

const LONG_BODY =
    "保留一个安静的入口，让重要的事情留在眼前。先走到窗边看看天气，再把今天的想法慢慢写下来。把复杂的事情拆成可以完成的小步，留一点空白给新的发现，也留一点时间给没有完成的部分。";

Deno.test("notes that fit are measured after the Markdown preview loads and show without a fade", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await createHomeNote(page, {
            title: "短句",
            body: "动效只回应操作；不做循环动画。",
            homeSortOrder: 0,
        });
        await createHomeNote(page, {
            title: "清单",
            body: "- [ ] 牛奶\n- [x] 面包\n- [ ] 鸡蛋\n- [ ] 咖啡豆",
            homeSortOrder: 1,
        });
        // A full load starts without the lazy Markdown chunk: the first
        // measurement sees the plain-text placeholder.
        await reloadHome(page);
        await waitForNoteCards(page, 2);
        await homeNote(page, "清单").locator("li.task-list-item").nth(3)
            .waitFor();
        await homeNote(page, "短句").locator(".home-note-body p").waitFor();
        // Observers deliver before the next frame; two frames let them settle.
        await page.evaluate(() =>
            new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
        );
        for (const title of ["短句", "清单"]) {
            const body = homeNote(page, title).locator(".home-note-body");
            const clip = await body.evaluate((element) => ({
                overflow: element.hasAttribute("data-overflow"),
                clientHeight: element.clientHeight,
                scrollHeight: element.scrollHeight,
            }));
            assertEquals(clip.overflow, false, `${title} has no fade`);
            assertEquals(
                clip.clientHeight,
                clip.scrollHeight,
                `${title} shows its whole body`,
            );
        }
        const tasks = await homeNote(page, "清单").locator(".home-note-body")
            .evaluate((element) => element.clientHeight);
        assertEquals(tasks, 88, "four task rows keep the 22px line pitch");
    } finally {
        await fixture.close();
    }
});

Deno.test("390px renders every pinned note as one vertical stack of Material cards", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 390, height: 844 },
    });
    const { page } = fixture;
    try {
        for (let index = 0; index < 8; index++) {
            await createHomeNote(page, {
                title: `堆叠 ${index}`,
                body: index === 0
                    ? "- [ ] 待办一\n- [x] 待办二\n\n" + LONG_BODY
                    : LONG_BODY,
                color: index === 0 ? "amber" : "paper",
                homeSortOrder: index,
            });
        }
        await reloadHome(page);
        await waitForNoteCards(page, 8);
        const metrics = await measureHomeNotes(page);
        assertEquals(metrics.flow, "stack");
        assertEquals(metrics.cards.length, 8);
        assertEquals(metrics.cards.map((card) => card.title), [
            "堆叠 0",
            "堆叠 1",
            "堆叠 2",
            "堆叠 3",
            "堆叠 4",
            "堆叠 5",
            "堆叠 6",
            "堆叠 7",
        ]);
        for (const card of metrics.cards) {
            assertEquals(
                Math.round(card.width),
                Math.round(metrics.search.width),
            );
            assertEquals(Math.round(card.height), 134);
        }
        assertEquals(
            await page.locator(
                ".zen-inline-notes, .zen-inline-notes-position, .note-position",
            ).count(),
            0,
        );

        const first = homeNote(page, "堆叠 0").locator(".home-note-card");
        // The always-visible 44px menu target centres on the title line.
        const [titleBox, menuBox] = await Promise.all([
            first.locator(".home-note-title").boundingBox(),
            first.getByRole("button", { name: "更多操作" }).boundingBox(),
        ]);
        assert(titleBox && menuBox);
        const offset = (menuBox.y + menuBox.height / 2) -
            (titleBox.y + titleBox.height / 2);
        assert(
            Math.abs(offset) <= 1,
            `note menu centre is ${offset}px off the title line`,
        );
        // The title opens the note from a 44px band: it reaches into the
        // card padding above and the gap below without moving the body.
        const titleHits = await first.locator(".home-note-title").evaluate(
            (title) => {
                const box = title.getBoundingClientRect();
                const x = box.left + Math.min(box.width / 2, 24);
                return [box.top - 15, box.bottom + 3].map((y) =>
                    document.elementFromPoint(x, y)?.closest(
                        ".home-note-title",
                    ) === title
                );
            },
        );
        assertEquals(titleHits, [true, true], "title hit band spans 44px");
        const body = first.locator(".home-note-body");
        assertEquals(await body.getAttribute("data-overflow"), "true");
        const clip = await body.evaluate((element) => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            overflow: getComputedStyle(element).overflow,
        }));
        assert(
            clip.clientHeight > 0 && clip.clientHeight <= 66,
            `visible body ${clip.clientHeight}px`,
        );
        assert(clip.scrollHeight > clip.clientHeight);
        assertEquals(clip.overflow, "hidden");

        await homeNote(page, "堆叠 0").getByRole("button", {
            name: "堆叠 0",
            exact: true,
        }).click();
        await libraryPanel(page).waitFor();

        assertEquals(
            await page.evaluate(() =>
                document.documentElement.scrollWidth >
                    document.documentElement.clientWidth
            ),
            false,
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("untitled flow notes keep one body and open from the card or keyboard", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 768, height: 1024 },
    });
    const { page } = fixture;
    try {
        await createHomeNote(page, {
            title: null,
            body: "流动里的第一行\n\n第二段内容只出现一次。",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const item = page.locator(".home-note-flow-item").first();
        const card = item.locator(".home-note-card");
        assertEquals(await card.getAttribute("data-untitled"), "true");
        assertEquals(await item.getAttribute("tabindex"), "0");
        assertEquals(await card.locator(".home-note-title").count(), 0);
        const text = await card.innerText();
        assertEquals(text.split("流动里的第一行").length - 1, 1);
        assert(text.includes("第二段内容只出现一次。"));

        await item.focus();
        await page.keyboard.press("Enter");
        await libraryPanel(page).waitFor();
        await page.getByRole("button", { name: "返回首页", exact: true })
            .click();
        await libraryPanel(page).waitFor({ state: "detached" });

        await card.locator(".home-note-body").click({
            position: { x: 10, y: 10 },
        });
        await libraryPanel(page).waitFor();
        await page.getByRole("button", { name: "返回首页", exact: true })
            .click();
        await libraryPanel(page).waitFor({ state: "detached" });
    } finally {
        await fixture.close();
    }
});

Deno.test("wide previews reclip when the note grid becomes a mobile stack", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 768, height: 1024 },
    });
    const { page } = fixture;
    try {
        await createHomeNote(page, {
            title: "跨断点预览",
            body: "第一行\n第二行\n第三行\n第四行\n第五行\n第六行",
            size: "w",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const body = homeNote(page, "跨断点预览").locator(".home-note-body");
        await body.locator("p").waitFor();
        await page.waitForFunction(() => {
            const height = document.querySelector(".home-note-body")
                ?.clientHeight;
            return height !== undefined && height > 88 && height <= 110;
        });
        const desktopSymmetry = await body.evaluate((element) => {
            const card = element.closest(".home-note-card")!;
            const style = getComputedStyle(card);
            const head = card.querySelector(".home-note-head")!;
            const cardRect = card.getBoundingClientRect();
            const headRect = head.getBoundingClientRect();
            const bodyRect = element.getBoundingClientRect();
            return {
                paddingTop: style.paddingTop,
                paddingBottom: style.paddingBottom,
                top: Math.round(headRect.top - cardRect.top),
                bottom: Math.round(cardRect.bottom - bodyRect.bottom),
            };
        });
        assertEquals(desktopSymmetry.paddingTop, "20px");
        assertEquals(desktopSymmetry.paddingBottom, "20px");
        assert(
            Math.abs(desktopSymmetry.top - desktopSymmetry.bottom) <= 1,
            `desktop top ${desktopSymmetry.top}px vs bottom ${desktopSymmetry.bottom}px`,
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() =>
            document.querySelector(".home-notes--flow")?.getAttribute(
                "data-mode",
            ) === "stack"
        );
        // The compact card must leave its bottom padding clear, not retain
        // the four-line desktop height after only its CSS budget changes.
        await page.waitForFunction(
            () => {
                const body = document.querySelector(".home-note-body");
                return body && body.clientHeight > 0 && body.clientHeight <= 66;
            },
            undefined,
            { timeout: 5000 },
        );
        const mobileSymmetry = await body.evaluate((element) => {
            const card = element.closest(".home-note-card")!;
            const style = getComputedStyle(card);
            const head = card.querySelector(".home-note-head")!;
            const cardRect = card.getBoundingClientRect();
            const headRect = head.getBoundingClientRect();
            const bodyRect = element.getBoundingClientRect();
            return {
                paddingTop: style.paddingTop,
                paddingBottom: style.paddingBottom,
                top: Math.round(headRect.top - cardRect.top),
                bottom: Math.round(cardRect.bottom - bodyRect.bottom),
            };
        });
        assertEquals(mobileSymmetry.paddingTop, "19px");
        assertEquals(mobileSymmetry.paddingBottom, "19px");
        assert(
            Math.abs(mobileSymmetry.top - mobileSymmetry.bottom) <= 1,
            `mobile top ${mobileSymmetry.top}px vs bottom ${mobileSymmetry.bottom}px`,
        );
    } finally {
        await fixture.close();
    }
});
