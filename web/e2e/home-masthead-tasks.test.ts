import { assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import {
    clickIntoEditor,
    closeLibrary,
    libraryPanel,
    openNotes,
} from "./helpers/library.ts";

Deno.test("masthead task checkboxes list open and completed tasks in order, toggle both ways, persist across reload, and save through the document version", async () => {
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

        const masthead = page.locator(".home-masthead");
        const tasksList = masthead.getByRole("list", {
            name: "待办",
            exact: true,
        });
        await tasksList.waitFor();

        // Both open and completed tasks are listed in document order; count shows 1 / 2.
        assertEquals(
            await masthead.locator(".home-masthead__section-count").first()
                .textContent(),
            "1 / 2",
        );
        const taskItems = tasksList.locator(".home-masthead__task");
        assertEquals(await taskItems.count(), 2);
        assertEquals(
            await taskItems.locator(".home-masthead__task-text")
                .allTextContents(),
            ["第一项", "第二项"],
        );
        assertEquals(
            await taskItems.locator(".home-masthead__task-source")
                .allTextContents(),
            ["直接勾选", "直接勾选"],
        );
        assertEquals(
            await taskItems.nth(0).getAttribute("data-checked"),
            null,
        );
        assertEquals(
            await taskItems.nth(1).getAttribute("data-checked"),
            "true",
        );

        const firstCheckbox = taskItems.nth(0).getByRole("checkbox", {
            name: "第一项",
            exact: true,
        });
        await Promise.all([
            page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/documents/${note.id}`) &&
                response.ok()
            ),
            firstCheckbox.click(),
        ]);

        await page.waitForFunction(() =>
            document.querySelector(".home-masthead__section-count")
                ?.textContent === "2 / 2"
        );
        assertEquals(
            await taskItems.nth(0).getAttribute("data-checked"),
            "true",
        );

        const bodyAfterCheck = await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json()).data
                    .body as string,
            note.id,
        );
        assertEquals(
            bodyAfterCheck,
            "- [x] 第一项\n- [x] 第二项\n\n```\n- [ ] 代码里的不是任务\n```",
        );

        // After reload, all tasks remain visible in their original order and can be unchecked.
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        assertEquals(
            await masthead.locator(".home-masthead__section-count").first()
                .textContent(),
            "2 / 2",
        );
        assertEquals(await taskItems.count(), 2);
        assertEquals(
            await taskItems.locator(".home-masthead__task-text")
                .allTextContents(),
            ["第一项", "第二项"],
        );
        assertEquals(
            await taskItems.nth(0).getAttribute("data-checked"),
            "true",
        );
        assertEquals(
            await taskItems.nth(1).getAttribute("data-checked"),
            "true",
        );

        const secondCheckbox = taskItems.nth(1).getByRole("checkbox", {
            name: "第二项",
            exact: true,
        });
        await Promise.all([
            page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/documents/${note.id}`) &&
                response.ok()
            ),
            secondCheckbox.click(),
        ]);

        await page.waitForFunction(() =>
            document.querySelector(".home-masthead__section-count")
                ?.textContent === "1 / 2"
        );
        assertEquals(
            await taskItems.nth(1).getAttribute("data-checked"),
            null,
        );
        const bodyAfterUncheck = await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json()).data
                    .body as string,
            note.id,
        );
        assertEquals(
            bodyAfterUncheck,
            "- [x] 第一项\n- [ ] 第二项\n\n```\n- [ ] 代码里的不是任务\n```",
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("masthead task toggles coalesce into one PATCH, Space toggles a focused task, and tasks stay interactive and synchronized while open in the editor", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "连续勾选",
            body: "- [ ] 甲\n- [ ] 乙\n- [ ] 丙",
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

        const masthead = page.locator(".home-masthead");
        const tasksList = masthead.getByRole("list", {
            name: "待办",
            exact: true,
        });
        await tasksList.waitFor();
        assertEquals(
            await masthead.locator(".home-masthead__section-count").first()
                .textContent(),
            "0 / 3",
        );

        const saved = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${note.id}`) &&
            response.ok()
        );
        await tasksList.getByRole("checkbox", { name: "甲", exact: true })
            .click();
        await tasksList.getByRole("checkbox", { name: "乙", exact: true })
            .focus();
        await page.keyboard.press("Space");
        await saved;
        await page.waitForFunction(() =>
            document.querySelector(".home-masthead__section-count")
                ?.textContent === "2 / 3"
        );
        await page.waitForTimeout(2000);
        assertEquals(patches, 1, "toggles inside one window save once");

        const body = await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json()).data
                    .body as string,
            note.id,
        );
        assertEquals(body, "- [x] 甲\n- [x] 乙\n- [ ] 丙");

        // Opening the note in the editor keeps masthead tasks interactive and in sync with the editor draft.
        await homeNote(page, "连续勾选").click();
        await libraryPanel(page).waitFor();
        const editor = page.locator(".document-editor-container .ProseMirror");
        await editor.waitFor({ state: "visible" });

        const remaining = tasksList.getByRole("checkbox", {
            name: "丙",
            exact: true,
        });
        assertEquals(await remaining.isDisabled(), false);
        await remaining.click();
        await page.waitForFunction(() =>
            document.querySelector(".home-masthead__section-count")
                    ?.textContent === "3 / 3" &&
            document.querySelectorAll(
                    '.document-editor-container .ProseMirror li[data-item-type="task"][data-checked="true"]',
                ).length === 3
        );

        await openNotes(page);
        await editor.waitFor({ state: "visible" });
        // Type unsaved text in the open editor and toggle a masthead task; neither edit is lost.
        await clickIntoEditor(
            editor.locator('li[data-item-type="task"]').nth(2).locator("p"),
        );
        await page.keyboard.press("End");
        await page.keyboard.insertText("（补充）");
        await tasksList.getByRole("checkbox", { name: "甲", exact: true })
            .click();

        await page.waitForFunction(() =>
            document.querySelector(".home-masthead__section-count")
                    ?.textContent === "2 / 3" &&
            document.querySelector(
                    '.document-editor-container .ProseMirror li[data-item-type="task"]',
                )?.getAttribute("data-checked") === "false"
        );
        await page.waitForFunction(
            async (id) => {
                const doc = (await (await fetch(`/api/documents/${id}`)).json())
                    .data;
                return typeof doc?.body === "string" &&
                    doc.body.trim() === "- [ ] 甲\n- [x] 乙\n- [x] 丙（补充）";
            },
            note.id,
        );
        assertEquals(
            await tasksList.locator(".home-masthead__task-text")
                .allTextContents(),
            ["甲", "乙", "丙（补充）"],
        );
        await openNotes(page);
        await closeLibrary(page);
    } finally {
        await fixture.close();
    }
});
