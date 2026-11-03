import { assertEquals } from "@std/assert";
import {
    countLayoutPatches,
    createHomeNote,
    homeNote,
    layoutPatch,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

Deno.test("the note size persists with one PATCH and code stays clipped without scrollbars", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1920, height: 1080 },
    });
    const { page } = fixture;
    try {
        await createHomeNote(page, {
            title: "长代码",
            body:
                "```sh\nssh -L 51121:127.0.0.1:51121 -L 51122:127.0.0.1:51122 -N engineer@very-long-hostname.example.internal\n```\n\n后续正文。",
            col: 0,
            row: 0,
            band: "left",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const patches = countLayoutPatches(page);
        const card = homeNote(page, "长代码").locator(".home-note-card");
        await card.hover();
        await card.getByRole("button", { name: "更多操作", exact: true })
            .click();
        const saved = layoutPatch(page);
        await page.getByRole("menuitemradio", { name: "宽", exact: true })
            .click();
        await saved;
        await page.waitForTimeout(250);
        assertEquals(patches.count(), 1, "one PATCH for one size change");

        const pre = card.locator(".home-note-body pre").first();
        await pre.waitFor();
        const scroll = await pre.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            scrollbarWidth: getComputedStyle(element).scrollbarWidth,
            overflow: getComputedStyle(element).overflow,
        }));
        assertEquals(scroll.scrollWidth > scroll.clientWidth, true);
        assertEquals(scroll.scrollbarWidth, "none");
        assertEquals(scroll.overflow, "hidden");

        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const reloaded = homeNote(page, "长代码").locator(".home-note-card");
        await reloaded.hover();
        await reloaded.getByRole("button", {
            name: "更多操作",
            exact: true,
        }).click();
        assertEquals(
            await page.getByRole("menuitemradio", {
                name: "宽",
                exact: true,
            }).getAttribute("aria-checked"),
            "true",
        );
        await page.keyboard.press("Escape");
        await page.getByRole("menu").waitFor({ state: "detached" });
        const width = (await homeNote(page, "长代码").boundingBox())!.width;
        assertEquals(Math.round(width), 372);
    } finally {
        await fixture.close();
    }
});

Deno.test("unpin removes the note from home", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "取消固定的笔记",
            body: "移出首页后不再呈现。",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const card = homeNote(page, "取消固定的笔记");
        await card.hover();
        await card.getByRole("button", { name: "更多操作", exact: true })
            .click();
        const changed = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${note.id}`)
        );
        await page.getByRole("menuitem", { name: "移出首页", exact: true })
            .click();
        assertEquals((await changed).ok(), true);
        await page.waitForFunction(() =>
            document.querySelectorAll(".home-note-card").length === 0
        );
        const pinned = await page.evaluate(async (id) => {
            const document = (await (await fetch(`/api/documents/${id}`))
                .json()).data;
            return document.isHomeFixed as boolean;
        }, note.id);
        assertEquals(pinned, false);
    } finally {
        await fixture.close();
    }
});
