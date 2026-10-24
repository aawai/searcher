import { assert, assertEquals } from "@std/assert";
import {
    countLayoutPatches,
    createHomeNote,
    expectLayout,
    layoutPatch,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

Deno.test("a focused home note moves by cell with arrows, Enter confirms and Escape cancels", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "键盘笔记",
            body: "方向键移动，Enter 确认，Escape 取消。",
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
                "第 2 列第 1 行",
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
        await expectLayout(page, note.id, { col: 1, row: 0, size: "s" });
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
                "第 1 列第 1 行",
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
        await expectLayout(page, note.id, { col: 1, row: 0, size: "s" });
        assertEquals(
            Math.round((await wrapper.boundingBox())!.x),
            1052,
        );

        await reloadHome(page);
        await waitForNoteCards(page, 1);
        assertEquals(
            Math.round((await wrapper.boundingBox())!.x),
            1052,
        );
    } finally {
        await fixture.close();
    }
});
