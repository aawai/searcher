import { assert, assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import { libraryPanel } from "./helpers/library.ts";

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
            band: "left",
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
                gap: style.rowGap,
            };
        });
        assertEquals(measure.width, 180);
        assertEquals(measure.height, 180);
        assertEquals(measure.radius, "16px");
        assertEquals(measure.shadow !== "none", true);
        assertEquals(measure.backdrop.includes("blur"), true);
        assertEquals(measure.gap, "8px");

        const typography = await card.evaluate((element) => {
            const title = element.querySelector(".home-note-title");
            const body = element.querySelector(".home-note-body");
            if (!title || !body) throw new Error("title and body are rendered");
            const titleStyle = getComputedStyle(title);
            const bodyStyle = getComputedStyle(body);
            return {
                titleSize: titleStyle.fontSize,
                titleLine: titleStyle.lineHeight,
                bodySize: bodyStyle.fontSize,
                bodyLine: bodyStyle.lineHeight,
            };
        });
        assertEquals(typography.titleSize, "17px");
        assertEquals(typography.titleLine, "24px");
        assertEquals(typography.bodySize, "14px");
        assertEquals(typography.bodyLine, "22px");

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

Deno.test("an untitled note shows its body once and opens from the card or keyboard", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await createHomeNote(page, {
            title: null,
            body: "窗边的第一行\n\n第二段内容只出现一次。",
            band: "left",
            col: 0,
            row: 0,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const wrapper = page.locator(".home-note").first();
        const card = wrapper.locator(".home-note-card");
        assertEquals(await card.getAttribute("data-untitled"), "true");
        assertEquals(
            await card.locator(".home-note-title").count(),
            0,
            "no duplicate title row",
        );
        assertEquals(
            await card.locator(".home-note-head").count(),
            0,
            "an untitled note without tasks has no header",
        );
        const text = await card.innerText();
        assertEquals(
            text.split("窗边的第一行").length - 1,
            1,
            "the first line is not repeated as a title",
        );
        assert(text.includes("第二段内容只出现一次。"));

        await card.locator(".home-note-body").click({
            position: { x: 10, y: 10 },
        });
        await libraryPanel(page).waitFor();
        await page.getByRole("button", { name: "关闭资料库", exact: true })
            .click();
        await libraryPanel(page).waitFor({ state: "detached" });

        await wrapper.focus();
        await page.keyboard.press("Enter");
        await libraryPanel(page).waitFor();
        await page.getByRole("button", { name: "关闭资料库", exact: true })
            .click();
        await libraryPanel(page).waitFor({ state: "detached" });
    } finally {
        await fixture.close();
    }
});
