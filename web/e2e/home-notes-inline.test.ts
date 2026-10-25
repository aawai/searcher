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
        await first.locator(".note-quick-dot--amber").waitFor();
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
