import { assert, assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import { closeLibrary, libraryPanel } from "./helpers/library.ts";

Deno.test("masthead task checkboxes toggle directly, stay visible as just-completed until reload, and save through the document version", async () => {
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

        // Only open tasks are listed on fresh load; count shows 1 / 2.
        assertEquals(
            await masthead.locator(".home-masthead__section-count").first()
                .textContent(),
            "1 / 2",
        );
        const taskItems = tasksList.locator(".home-masthead__task");
        assertEquals(await taskItems.count(), 1);
        assertEquals(
            await taskItems.first().locator(".home-masthead__task-text")
                .textContent(),
            "第一项",
        );
        assertEquals(
            await taskItems.first().locator(".home-masthead__task-source")
                .textContent(),
            "直接勾选",
        );

        const firstCheckbox = taskItems.first().getByRole("checkbox", {
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

        // In the current session, the newly checked task stays visible as just-completed so the user can undo it.
        await page.waitForFunction(() =>
            document.querySelector(".home-masthead__section-count")
                ?.textContent === "2 / 2"
        );
        assertEquals(
            await taskItems.first().getAttribute("data-checked"),
            "true",
        );
        assertEquals(
            await taskItems.first().getAttribute("data-just-completed"),
            "true",
        );

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

        // After reload, completed tasks from prior sessions are no longer listed in the open to-dos list.
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        assertEquals(
            await masthead.locator(".home-masthead__section-count").first()
                .textContent(),
            "2 / 2",
        );
        assertEquals(await masthead.locator(".home-masthead__task").count(), 0);
    } finally {
        await fixture.close();
    }
});

Deno.test("masthead task toggles coalesce into one PATCH, Space toggles a focused task, and tasks lock while the note is open in the editor", async () => {
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

        // Opening the note in the editor locks its tasks in the masthead.
        await homeNote(page, "连续勾选").click();
        await libraryPanel(page).waitFor();
        const remaining = tasksList.getByRole("checkbox", {
            name: "丙",
            exact: true,
        });
        assert(await remaining.isDisabled());
        await closeLibrary(page);
        assertEquals(await remaining.isDisabled(), false);
    } finally {
        await fixture.close();
    }
});
