import { assert, assertEquals } from "@std/assert";
import {
    createHomeNote,
    homeNote,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import { closeLibrary, libraryPanel, libraryView } from "./helpers/library.ts";

Deno.test("home-masthead-document: entries render excerpts, copy code, unpin, open library and never load editor-vendor on home", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const textNote = await createHomeNote(page, {
            title: "封面笔记",
            body: "这是一段安静的说明。\n\n- 第一件事\n- 第二件事",
            homeSortOrder: 0,
        });
        const codeNote = await createHomeNote(page, {
            title: "部署命令",
            body: "```sh\ndeno task build\ndeno task start\n```",
            homeSortOrder: 1,
        });
        const tasksOnlyNote = await createHomeNote(page, {
            title: "纯任务笔记",
            body: "- [x] 已完成\n- [ ] 待完成",
            homeSortOrder: 2,
        });
        const requestedUrls: string[] = [];
        page.on("request", (request) => requestedUrls.push(request.url()));
        await reloadHome(page);
        await waitForNoteCards(page, 3);

        const cover = homeNote(page, "封面笔记");
        await cover.waitFor({ state: "visible" });
        assertEquals(await cover.getAttribute("data-kind"), "text");
        assertEquals(
            await cover.locator("[contenteditable='true']").count(),
            0,
        );
        assertEquals(
            requestedUrls.some((url) => url.includes("editor-vendor")),
            false,
            "editor-vendor chunk must not load on the home page",
        );

        const codeEntry = homeNote(page, "部署命令");
        assertEquals(await codeEntry.getAttribute("data-kind"), "code");
        assertEquals(
            await codeEntry.locator(".home-masthead__entry-summary")
                .textContent(),
            "deno task build",
        );
        const copyBtn = codeEntry.locator(".home-masthead__copy-btn");
        await copyBtn.waitFor({ state: "visible" });

        const tasksEntry = homeNote(page, "纯任务笔记");
        assertEquals(await tasksEntry.getAttribute("data-kind"), "tasks-only");
        assertEquals(
            await tasksEntry.locator(".home-masthead__entry-summary")
                .textContent(),
            "2 项任务 · 1 已完成",
        );

        // Unpin via the ⋯ menu removes the entry from home.
        await tasksEntry.hover();
        await tasksEntry.getByRole("button", { name: "更多操作", exact: true })
            .click();
        const changed = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${tasksOnlyNote.id}`) &&
            response.ok()
        );
        await page.getByRole("menuitem", { name: "取消固定", exact: true })
            .click();
        await changed;
        await waitForNoteCards(page, 2);
        const pinned = await page.evaluate(async (id) => {
            const document = (await (await fetch(`/api/documents/${id}`))
                .json()).data;
            return document.isHomeFixed as boolean;
        }, tasksOnlyNote.id);
        assertEquals(pinned, false);

        // Clicking an entry opens the note window.
        await cover.click();
        await libraryPanel(page).waitFor();
        await closeLibrary(page);

        // Footer "全部笔记 →" opens the notes library.
        await page.locator(".home-masthead__all-notes").click();
        await libraryPanel(page).waitFor();
        await libraryView(page, "notes").waitFor();
        await closeLibrary(page);

        void textNote;
        void codeNote;
    } finally {
        await fixture.close();
    }
});

Deno.test("an untitled note shows its first line as title without repeating it in the summary and opens by click or Enter", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await createHomeNote(page, {
            title: null,
            body: "窗边的第一行\n\n第二段内容只出现一次。",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);

        const entry = page.locator(".home-masthead__entry").first();
        assertEquals(await entry.getAttribute("data-untitled"), "true");
        assertEquals(
            await entry.locator(".home-masthead__entry-title").textContent(),
            "窗边的第一行",
        );
        const summary = await entry.locator(".home-masthead__entry-summary")
            .textContent();
        assertEquals(summary, "第二段内容只出现一次。");
        const text = await entry.innerText();
        assertEquals(
            text.split("窗边的第一行").length - 1,
            1,
            "the first line is not repeated in the excerpt",
        );
        assert(text.includes("第二段内容只出现一次。"));

        await entry.click();
        await libraryPanel(page).waitFor();
        await closeLibrary(page);

        await entry.focus();
        await page.keyboard.press("Enter");
        await libraryPanel(page).waitFor();
        await closeLibrary(page);
    } finally {
        await fixture.close();
    }
});
