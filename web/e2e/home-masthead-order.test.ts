import { assertEquals } from "@std/assert";
import {
    captureHomeOrderWrites,
    createHomeNote,
    dragWithMouse,
    homeNote,
    homeOrderPatch,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

const BODY = "首页顺序决定刊头置顶笔记顺序，不按创建时间排列。";

Deno.test("masthead entries follow homeSortOrder, reorder via menu and drag with PATCH /api/documents/home-order, and persist across reload", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const created = new Map<string, string>();
        for (
            const [title, order] of [
                ["顺序 3", 3],
                ["顺序 1", 1],
                ["顺序 0", 0],
                ["顺序 2", 2],
            ] as const
        ) {
            const doc = await createHomeNote(page, {
                title,
                body: BODY,
                homeSortOrder: order,
            });
            created.set(title, doc.id);
        }
        await reloadHome(page);
        await waitForNoteCards(page, 4);

        const readTitles = () =>
            page.locator(".home-masthead__entry-title").allTextContents();
        assertEquals(await readTitles(), [
            "顺序 0",
            "顺序 1",
            "顺序 2",
            "顺序 3",
        ]);
        assertEquals(
            await page.locator(".home-masthead__entry-no").allTextContents(),
            ["01", "02", "03", "04"],
        );

        // The search box remains interactive alongside the masthead.
        await page.locator("#search-query").click();
        assertEquals(
            await page.evaluate(() =>
                document.activeElement?.id === "search-query"
            ),
            true,
        );

        const writes = captureHomeOrderWrites(page);

        // Reorder via menu "下移" on the first entry ("顺序 0" -> second position).
        const first = homeNote(page, "顺序 0");
        await first.hover();
        await first.getByRole("button", { name: "更多操作", exact: true })
            .click();
        const menuSaved = homeOrderPatch(page);
        await page.getByRole("menuitem", { name: "下移", exact: true }).click();
        await menuSaved;

        assertEquals(await readTitles(), [
            "顺序 1",
            "顺序 0",
            "顺序 2",
            "顺序 3",
        ]);
        assertEquals(writes.writes().length, 1);
        assertEquals(writes.writes()[0].ids, [
            created.get("顺序 1")!,
            created.get("顺序 0")!,
            created.get("顺序 2")!,
            created.get("顺序 3")!,
        ]);

        // Drag reorder: drag "顺序 3" up to the top of the list.
        const last = homeNote(page, "顺序 3");
        const topEntry = homeNote(page, "顺序 1");
        const lastBox = (await last.boundingBox())!;
        const topBox = (await topEntry.boundingBox())!;
        const dragSaved = homeOrderPatch(page);
        await dragWithMouse(page, last, 0, topBox.y - lastBox.y - 12);
        await dragSaved;

        assertEquals(await readTitles(), [
            "顺序 3",
            "顺序 1",
            "顺序 0",
            "顺序 2",
        ]);

        // Order persists across a full page reload.
        await reloadHome(page);
        await waitForNoteCards(page, 4);
        assertEquals(await readTitles(), [
            "顺序 3",
            "顺序 1",
            "顺序 0",
            "顺序 2",
        ]);
    } finally {
        await fixture.close();
    }
});
