import { assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

Deno.test("home-notes-document: 180px cell, Material card and no editor chunk on home", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await createHomeNote(page, {
            title: "封面笔记",
            body:
                "# 封面笔记\n\n![示例图片](asset://sample-image-asset-id)\n\n<!-- pagebreak -->\n\n第二页内容",
            color: "sage",
            col: 0,
            row: 0,
        });
        const requestedUrls: string[] = [];
        page.on("request", (request) => requestedUrls.push(request.url()));
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const wrapper = homeNote(page, "封面笔记");
        const card = wrapper.locator(".home-note-card");
        await card.waitFor({ state: "visible" });
        const measure = await card.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                radius: style.borderRadius,
                shadow: style.boxShadow,
                backdrop: style.backdropFilter,
            };
        });
        assertEquals(measure.width, 180);
        assertEquals(measure.height, 180);
        assertEquals(measure.radius, "16px");
        assertEquals(measure.shadow !== "none", true);
        assertEquals(measure.backdrop.includes("blur"), true);
        // The body is a readonly preview, never an editor instance.
        assertEquals(
            await card.locator("[contenteditable='true']").count(),
            0,
        );
        assertEquals(
            await card.locator(".home-note-body h1").first().evaluate((el) =>
                getComputedStyle(el).fontSize
            ),
            "14px",
        );
        assertEquals(
            requestedUrls.some((url) => url.includes("editor-vendor")),
            false,
            "editor-vendor chunk must not load on the home page",
        );
    } finally {
        await fixture.close();
    }
});
