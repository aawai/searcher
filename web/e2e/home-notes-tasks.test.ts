import { assert, assertEquals } from "@std/assert";
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
        assertEquals(
            await card.locator(".home-note-progress").textContent(),
            "1/2",
        );
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
        await card.locator(".home-note-progress", { hasText: "2/2" })
            .waitFor();
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
        const reloaded = homeNote(page, "直接勾选").locator(
            ".home-note-card",
        );
        await reloaded.getByRole("checkbox", {
            name: "已完成任务，点击标记为未完成",
        }).nth(1).waitFor();
        assertEquals(
            await reloaded.getByRole("checkbox", {
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
        assertEquals(
            await card.locator(".home-note-progress").textContent(),
            "0/2",
        );
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
        await card.locator(".home-note-progress", { hasText: "2/2" })
            .waitFor();
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

Deno.test("coarse pointers get a 44px task target without changing the line pitch", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "触屏任务",
            body: "- [ ] 单独任务",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        const card = homeNote(page, "触屏任务").locator(".home-note-card");
        assertEquals(
            await card.locator(".home-note-progress").textContent(),
            "0/1",
        );
        const row = card.locator("li.task-list-item");
        const box = await row.getByRole("checkbox").boundingBox();
        assert(box);
        const rowBox = await row.boundingBox();
        assert(rowBox);
        assertEquals(Math.round(rowBox.height), 22);
        assertEquals(Math.round(box.height), 16);
        const saved = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${note.id}`) &&
            response.ok()
        );
        // 18px above the box centre is outside the 16px drawing but inside the
        // extended 44px target in the leading checkbox column.
        await page.touchscreen.tap(
            box.x + box.width / 2,
            box.y + box.height / 2 - 18,
        );
        await saved;
        await card.getByRole("checkbox", {
            name: "已完成任务，点击标记为未完成",
        }).waitFor();
        await card.locator(".home-note-progress", { hasText: "1/1" })
            .waitFor();
        const checked = await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json()).data
                    .body as string,
            note.id,
        );
        assertEquals(checked, "- [x] 单独任务");
        assertEquals(Math.round((await row.boundingBox())!.height), 22);
    } finally {
        await fixture.close();
    }
});
