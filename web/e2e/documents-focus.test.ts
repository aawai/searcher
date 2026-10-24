import { assertEquals, assertRejects } from "@std/assert";
import { errors } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { openNotes } from "./helpers/desk.ts";

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
    await openNotes(page);
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
                name: "Markdown 源码",
                exact: true,
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

            // Focus outside editor container (e.g. click workspace navigation back button)
            const patchPromise = page.waitForResponse(
                (res) =>
                    res.request().method() === "PATCH" &&
                    res.url().endsWith(`/api/documents/${doc.id}`) &&
                    res.status() === 200,
            );

            await page.getByRole("button", { name: "返回上一级", exact: true })
                .click();
            await patchPromise;
            await editor.waitFor({ state: "detached" });
            await page.locator("input[data-workspace-search]").waitFor();

            assertEquals(
                writes.length,
                countBefore + 1,
                "Leaving editor must flush dirty content exactly once",
            );

            // Reopen editor to continue tests
            await page.locator(`[data-document-id="${doc.id}"] h4 button`)
                .click();
            await title.waitFor({ state: "visible" });
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
