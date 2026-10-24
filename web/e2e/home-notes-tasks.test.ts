import { assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

Deno.test("home note task checkboxes toggle directly and save through the document version", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "直接勾选",
            body:
                "- [ ] 第一项\n- [x] 第二项\n\n```\n- [ ] 代码里的不是任务\n```",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const card = homeNote(page, "直接勾选").locator(".home-note-card");
        const first = card.getByRole("checkbox", {
            name: "未完成任务，点击标记为已完成",
        });
        await Promise.all([
            page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/documents/${note.id}`) &&
                response.ok()
            ),
            first.click(),
        ]);
        await card.getByRole("checkbox", {
            name: /已完成任务，点击标记为未完成/,
        }).first().waitFor();
        const body = await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json()).data
                    .body as string,
            note.id,
        );
        assertEquals(
            body,
            "- [x] 第一项\n- [x] 第二项\n\n```\n- [ ] 代码里的不是任务\n```",
        );
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        assertEquals(
            await homeNote(page, "直接勾选").getByRole("checkbox", {
                name: "已完成任务，点击标记为未完成",
            }).count(),
            2,
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("home note task toggles coalesce into one PATCH and Space toggles a focused task", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "连续勾选",
            body: "- [ ] 甲\n- [ ] 乙",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        let patches = 0;
        page.on("request", (request) => {
            if (
                request.method() === "PATCH" &&
                new URL(request.url()).pathname ===
                    `/api/documents/${note.id}`
            ) patches += 1;
        });
        const card = homeNote(page, "连续勾选").locator(".home-note-card");
        const row = (text: string) =>
            card.locator("li.task-list-item", { hasText: text })
                .getByRole("checkbox");
        const saved = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${note.id}`) &&
            response.ok()
        );
        await row("甲").click();
        await row("乙").focus();
        await page.keyboard.press("Space");
        await saved;
        await page.waitForTimeout(2000);
        assertEquals(patches, 1, "toggles inside one window save once");
        const body = await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json()).data
                    .body as string,
            note.id,
        );
        assertEquals(body, "- [x] 甲\n- [x] 乙");
    } finally {
        await fixture.close();
    }
});
