import { assertEquals, assertRejects } from "@std/assert";
import { errors } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { openNoteRows } from "./helpers/library.ts";
import {
    createHomeNote,
    homeNote,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

Deno.test("打开已有笔记不聚焦标题，新建笔记仍聚焦标题", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    await loginAndVisit(page, app.origin, "/", user);
    const doc = await createHomeNote(page, {
        title: "焦点入口笔记",
        body: "正文",
    });
    await page.reload();
    const frame = page.locator('[data-window-id="notes"]');
    const title = frame.getByRole("textbox", { name: "笔记标题", exact: true });
    const assertNotFocused = async () => {
        await title.waitFor({ state: "visible" });
        assertEquals(await title.inputValue(), "焦点入口笔记");
        assertEquals(
            await title.evaluate((el) => el === document.activeElement),
            false,
        );
    };
    const close = async () => {
        await frame.getByRole("button", { name: "关闭笔记", exact: true })
            .click();
        await frame.waitFor({ state: "hidden" });
    };

    await waitForNoteCards(page, 1);
    await homeNote(page, "焦点入口笔记").getByRole("button", {
        name: "焦点入口笔记",
        exact: true,
    }).click();
    await assertNotFocused();
    await close();

    await page.locator('[data-dock-id="notes"]').click();
    const tree = frame.getByRole("tree", { name: "笔记本", exact: true });
    const treeItem = tree.getByRole("treeitem", { name: "焦点入口笔记" });
    await treeItem.click();
    await assertNotFocused();
    assertEquals(
        await treeItem.evaluate((el) => el.contains(document.activeElement)),
        true,
    );
    await openNoteRows(page);
    await frame.locator(`[data-document-id="${doc.id}"] h4 button`).click();
    await assertNotFocused();

    await frame.getByRole("button", { name: "新建笔记", exact: true }).click();
    await page.waitForFunction(() =>
        document.activeElement?.getAttribute("aria-label") === "笔记标题"
    );
    assertEquals(
        await title.evaluate((el) => el === document.activeElement),
        true,
    );

    const deep = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    await loginAndVisit(deep, app.origin, "/", user);
    await deep.addInitScript((id) => {
        history.replaceState({
            usr: { openDocumentId: id },
            key: "focus-link",
            idx: 0,
        }, "");
    }, doc.id);
    await deep.reload();
    const deepTitle = deep.getByRole("textbox", {
        name: "笔记标题",
        exact: true,
    });
    await deepTitle.waitFor();
    assertEquals(await deepTitle.inputValue(), "焦点入口笔记");
    assertEquals(
        await deepTitle.evaluate((el) => el === document.activeElement),
        false,
    );

    const narrow = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    await loginAndVisit(narrow, app.origin, "/", user);
    await narrow.goto(app.origin + "/?view=notes");
    const narrowFrame = narrow.locator('[data-window-id="notes"]');
    const toggle = narrowFrame.getByRole("button", {
        name: "笔记侧栏",
        exact: true,
    });
    await narrowFrame.getByRole("textbox", { name: "笔记标题", exact: true })
        .waitFor();
    await toggle.click();
    await narrowFrame.locator(".documents-layout[data-drawer='open']")
        .waitFor();
    await narrowFrame.getByRole("treeitem", { name: "焦点入口笔记" }).click();
    await narrowFrame.locator(".documents-layout[data-drawer='closed']")
        .waitFor();
    await narrow.waitForFunction(() =>
        document.activeElement?.getAttribute("aria-label") === "笔记侧栏"
    );
    assertEquals(
        await toggle.evaluate((el) => el === document.activeElement),
        true,
    );
    assertEquals(
        await narrowFrame.getByRole("textbox", {
            name: "笔记标题",
            exact: true,
        })
            .evaluate((el) => el === document.activeElement),
        false,
    );
});

Deno.test("Documents focus boundaries, IME composition and leave flush contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const credentials = await app.seedAskFixtureUser({
        username: "doc_focus_user",
        password: "Doc-focus-pass-123!",
    });

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });

    await loginAndVisit(page, app.origin, "/", credentials);

    const doc = await page.evaluate(async () => {
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Focus契约", body: "初始正文" }),
        });
        if (!response.ok) throw new Error("Cannot create document");
        return (await response.json()).data as { id: string; version: number };
    });

    await page.reload();
    await openNoteRows(page);
    await page.locator(`[data-document-id="${doc.id}"] h4 button`).click();

    const editor = page.locator(".document-editor-container");
    const title = editor.getByRole("textbox", {
        name: "笔记标题",
        exact: true,
    });
    await title.waitFor({ state: "visible" });
    const prosemirror = editor.locator(".ProseMirror");
    await prosemirror.waitFor({ state: "visible" });

    const writes: Array<{ title?: string; body?: string; origin?: string }> =
        [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            request.url().endsWith(`/api/documents/${doc.id}`)
        ) {
            writes.push(
                request.postDataJSON() as {
                    title?: string;
                    body?: string;
                    origin?: string;
                },
            );
        }
    });

    await t.step(
        "clean focus navigation within editor never triggers PATCH",
        async () => {
            const countBefore = writes.length;
            await title.focus();
            await prosemirror.focus();
            await editor.getByRole("button", {
                name: /^切换编辑模式，当前：/,
            }).focus();
            await assertRejects(
                () =>
                    page.waitForRequest(
                        (request) =>
                            request.method() === "PATCH" &&
                            request.url().endsWith(`/api/documents/${doc.id}`),
                        { timeout: 500 },
                    ),
                errors.TimeoutError,
            );
            assertEquals(
                writes.length,
                countBefore,
                "Clean internal focus must not trigger PATCH",
            );
        },
    );

    await t.step(
        "leaving editor with dirty title flushes exactly once via PATCH",
        async () => {
            const countBefore = writes.length;
            await title.fill("失去焦点自动保存标题");

            // Moving focus into the persistent sidebar flushes the editor.
            const patchPromise = page.waitForResponse(
                (res) =>
                    res.request().method() === "PATCH" &&
                    res.url().endsWith(`/api/documents/${doc.id}`) &&
                    res.status() === 200,
            );

            await page.locator("input[data-workspace-search]:visible").click();
            await patchPromise;

            assertEquals(
                writes.length,
                countBefore + 1,
                "Leaving editor must flush dirty content exactly once",
            );

            // The editor remains mounted alongside the sidebar.
            assertEquals(await title.inputValue(), "失去焦点自动保存标题");
        },
    );

    await t.step(
        "IME composition on title blocks autosave until committed",
        async () => {
            const countBefore = writes.length;
            await title.focus();
            await title.dispatchEvent("compositionstart", { data: "" });
            await title.fill("正在输入的未完成拼音");
            // No write may arrive even after the 1500ms autosave debounce.
            await assertRejects(
                () =>
                    page.waitForRequest(
                        (request) =>
                            request.method() === "PATCH" &&
                            request.url().endsWith(`/api/documents/${doc.id}`),
                        { timeout: 1600 },
                    ),
                errors.TimeoutError,
            );
            assertEquals(
                writes.length,
                countBefore,
                "In-flight IME composition must block autosave",
            );

            await title.dispatchEvent("compositionend", {
                data: "已完成输入标题",
            });
            await title.fill("已完成输入标题");

            await page.waitForResponse(
                (res) =>
                    res.request().method() === "PATCH" &&
                    res.url().endsWith(`/api/documents/${doc.id}`) &&
                    res.status() === 200,
            );

            assertEquals(
                writes.length,
                countBefore + 1,
                "Committed title must autosave once composition completes",
            );
        },
    );
});
