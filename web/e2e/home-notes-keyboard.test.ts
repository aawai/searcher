import { assert, assertEquals } from "@std/assert";
import {
    countLayoutPatches,
    createHomeNote,
    expectLayout,
    layoutPatch,
    measureHomeNotes,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import { libraryPanel } from "./helpers/library.ts";

Deno.test("a focused home note moves by cell with arrows, Enter confirms and Escape cancels", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "键盘笔记",
            body: "方向键移动，Enter 确认，Escape 取消。",
            band: "left",
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const wrapper = page.locator(`.home-note[data-note-id="${note.id}"]`);
        const status = page.locator(".home-note-status");
        await wrapper.focus();
        const patches = countLayoutPatches(page);

        await page.keyboard.press("ArrowRight");
        await page.locator(".home-note-target").waitFor();
        await page.waitForFunction(() =>
            document.querySelector(".home-note-status")?.textContent?.includes(
                "右侧第 1 列第 1 行",
            )
        );
        const announcement = await status.textContent();
        assert(announcement?.includes("Enter 确认"), announcement ?? "");
        const target = await page.locator(".home-note-target").boundingBox();
        assert(target);
        assertEquals(Math.round(target.x), 1052);
        assertEquals(Math.round(target.y), 314);

        const saved = layoutPatch(page);
        await page.keyboard.press("Enter");
        await saved;
        await expectLayout(page, note.id, {
            band: "right",
            col: 0,
            row: 0,
            size: "s",
        });
        assertEquals(patches.count(), 1);
        await page.waitForFunction(
            (id) =>
                document.querySelector(`.home-note[data-note-id="${id}"]`)
                    ?.getBoundingClientRect().x === 1052,
            note.id,
        );

        // Escape after a preview leaves both the saved cell and the server alone.
        await wrapper.focus();
        await page.keyboard.press("ArrowLeft");
        await page.locator(".home-note-target").waitFor();
        await page.waitForFunction(() =>
            document.querySelector(".home-note-status")?.textContent?.includes(
                "左侧第 1 列第 1 行",
            )
        );
        await page.keyboard.press("Escape");
        await page.locator(".home-note-target").waitFor({ state: "detached" });
        await page.waitForFunction(() =>
            document.querySelector(".home-note-status")?.textContent?.includes(
                "已取消移动",
            )
        );
        assertEquals(patches.count(), 1);
        await expectLayout(page, note.id, {
            band: "right",
            col: 0,
            row: 0,
            size: "s",
        });
        assertEquals(
            Math.round((await wrapper.boundingBox())!.x),
            1052,
        );

        // Rows continue above the search box; Enter commits a negative row.
        await wrapper.focus();
        await page.keyboard.press("ArrowUp");
        await page.locator(".home-note-target").waitFor();
        await page.waitForFunction(() =>
            document.querySelector(".home-note-status")?.textContent?.includes(
                "搜索框上方第 1 行",
            )
        );
        const above = await page.locator(".home-note-target").boundingBox();
        assert(above);
        assertEquals(Math.round(above.x), 1052);
        assertEquals(Math.round(above.y), 122);
        const savedAbove = layoutPatch(page);
        await page.keyboard.press("Enter");
        await savedAbove;
        await expectLayout(page, note.id, {
            band: "right",
            col: 0,
            row: -1,
            size: "s",
        });
        assertEquals(patches.count(), 2);
        await page.waitForFunction(
            (id) =>
                document.querySelector(`.home-note[data-note-id="${id}"]`)
                    ?.getBoundingClientRect().y === 122,
            note.id,
        );
        const metrics = await measureHomeNotes(page);
        const placed = metrics.cards[0];
        assertEquals(Math.round(placed.y), 122);
        assert(metrics.topbar);
        assert(
            placed.y >= metrics.topbar.y + metrics.topbar.height,
            "negative rows stay below the top bar",
        );
        assert(
            placed.y < metrics.search.y,
            "the note sits above the search box",
        );

        await reloadHome(page);
        await waitForNoteCards(page, 1);
        assertEquals(
            Math.round((await wrapper.boundingBox())!.y),
            122,
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("the note wrapper joins the Tab order and Enter opens the note", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "可聚焦笔记",
            body: "键盘可以到达卡片本身。",
            band: "left",
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const wrapper = page.locator(`.home-note[data-note-id="${note.id}"]`);
        await page.locator("#search-query").focus();
        let reached = false;
        for (let step = 0; step < 60 && !reached; step++) {
            await page.keyboard.press("Tab");
            reached = await page.evaluate(
                (id) =>
                    document.activeElement?.matches(
                        `.home-note[data-note-id="${id}"]`,
                    ) ?? false,
                note.id,
            );
        }
        assert(reached, "the note wrapper is reachable with Tab");
        await page.keyboard.press("Tab");
        assertEquals(
            await wrapper.getByRole("button", { name: "更多操作" })
                .evaluate((element) => document.activeElement === element),
            true,
            "Tab skips the redundant title button and reaches note actions",
        );
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Enter");
        await libraryPanel(page).waitFor();
        await page.getByRole("button", { name: "返回首页", exact: true })
            .click();
        await libraryPanel(page).waitFor({ state: "detached" });
    } finally {
        await fixture.close();
    }
});
