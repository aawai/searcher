import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Notes focus boundary preserves network, versions and history", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser();
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    await loginAndVisit(page, app.origin, "/", credentials);
    const id = await page.evaluate(async () => {
        const response = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Focus contract", body: "原始正文" }),
        });
        if (!response.ok) throw new Error("Cannot create note");
        return (await response.json()).data.id as string;
    });
    await page.reload();
    await page.locator(
        '.desktop-dock button[data-workspace="notes"], .zen-edge-btn[data-workspace="notes"]',
    ).first().click();
    await page.locator(".notes-workspace-list .note-title").filter({
        hasText: "Focus contract",
    }).click();
    const editor = page.locator(".note-editor");
    const title = editor.getByRole("textbox", {
        name: "便签标题",
        exact: true,
    });
    const live = editor.locator(".note-live-editor .ProseMirror");
    await live.waitFor();
    const writes: Array<{ title: string; body: string; origin: string }> = [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            request.url().endsWith(`/api/notes/${id}`)
        ) {
            writes.push(request.postDataJSON());
        }
    });
    async function readState() {
        return await page.evaluate(async (id) => {
            const note = (await (await fetch(`/api/notes/${id}`)).json())
                .data as {
                    title: string;
                    body: string;
                    version: number;
                };
            const history =
                (await (await fetch(`/api/notes/${id}/versions`)).json())
                    .data as Array<{
                        title: string;
                        body: string;
                        version: number;
                    }>;
            return { note, history };
        }, id);
    }
    function saved(origin: string, timeout = 5000) {
        return page.waitForResponse(
            (response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/notes/${id}`) &&
                response.request().postDataJSON().origin === origin,
            { timeout },
        );
    }
    async function settled() {
        await editor.locator(".save-state.save-saved").waitFor();
    }
    await t.step(
        "clean title to body has no PATCH or version/history change",
        async () => {
            const before = await readState();
            await title.click();
            await live.click();
            await editor.getByRole("button", { name: "版本历史", exact: true })
                .click();
            await page.waitForTimeout(1800);
            assertEquals(writes, []);
            assertEquals(await readState(), before);
        },
    );
    for (const mode of ["源码", "所见即所得"]) {
        await t.step(
            `${mode}: Enter, Tab/Shift+Tab and mode switches preserve clean Markdown`,
            async () => {
                await editor.getByRole("tab", { name: mode, exact: true })
                    .click();
                const body = mode === "源码"
                    ? editor.locator("textarea.note-body-textarea")
                    : live;
                await body.waitFor();
                const before = await readState();
                const count = writes.length;
                await title.focus();
                await title.press("Enter");
                assertEquals(
                    await body.evaluate((el) => el === document.activeElement),
                    true,
                );
                await body.press("Shift+Tab");
                await page.keyboard.press("Tab");
                await title.focus();
                await title.press("Tab");
                await page.keyboard.press("Shift+Tab");
                assertEquals(
                    await title.evaluate((el) => el === document.activeElement),
                    true,
                );
                await editor.getByRole("tab", {
                    name: mode === "源码" ? "所见即所得" : "源码",
                    exact: true,
                }).click();
                await page.waitForTimeout(1800);
                assertEquals(writes.length, count);
                assertEquals(await readState(), before);
            },
        );
        await t.step(
            `${mode}: dirty title and body autosave together, never a title-only manual snapshot`,
            async () => {
                await editor.getByRole("tab", { name: mode, exact: true })
                    .click();
                const body = mode === "源码"
                    ? editor.locator("textarea.note-body-textarea")
                    : live;
                await body.waitFor();
                const before = await readState();
                const count = writes.length;
                await title.fill(`共同保存 ${mode}`);
                await editor.getByRole("tab", {
                    name: mode === "源码" ? "所见即所得" : "源码",
                    exact: true,
                }).click();
                await editor.getByRole("tab", { name: mode, exact: true })
                    .click();
                await title.press("Enter");
                await editor.getByRole("button", { name: "粗体", exact: true })
                    .focus();
                await body.focus();
                await page.waitForTimeout(300);
                assertEquals(writes.length, count);
                const response = saved("autosave");
                await body.fill(`最新正文 ${mode}`);
                await title.focus();
                await body.click();
                assertEquals((await response).status(), 200);
                await settled();
                assertEquals(writes.slice(count).map(({ origin }) => origin), [
                    "autosave",
                ]);
                const after = await readState();
                assertEquals(after.note.title, `共同保存 ${mode}`);
                assertEquals(after.note.body.trim(), `最新正文 ${mode}`);
                assertEquals(after.note.version, before.note.version + 1);
                assertEquals(after.history, before.history);
            },
        );
    }
    await t.step(
        "internal focus does not restart the original title debounce",
        async () => {
            const count = writes.length;
            await title.fill("原始 debounce");
            await page.waitForTimeout(1000);
            const response = saved("autosave", 1000);
            await title.press("Enter");
            await editor.getByRole("button", { name: "粗体", exact: true })
                .focus();
            assertEquals((await response).status(), 200);
            await settled();
            assertEquals(writes.length, count + 1);
        },
    );
    for (const destination of ["history", "color"]) {
        await t.step(
            `title-only dirty leave to ${destination} flushes exactly once with a manual snapshot`,
            async () => {
                const before = await readState();
                const count = writes.length;
                await title.fill(`真正离开 ${destination}`);
                const response = saved("manual");
                if (destination === "history") {
                    await editor.getByRole("button", {
                        name: "版本历史",
                        exact: true,
                    }).click();
                } else {
                    await editor.getByRole("radio").first().focus();
                }
                assertEquals((await response).status(), 200);
                await settled();
                await page.waitForTimeout(1800);
                assertEquals(writes.slice(count).map(({ origin }) => origin), [
                    "manual",
                ]);
                const after = await readState();
                assertEquals(after.note.version, before.note.version + 1);
                assertEquals(after.history[0].title, after.note.title);
                assertEquals(after.history[0].body, before.note.body);
                assertEquals(after.history[0].version, after.note.version);
                assertEquals(after.history.slice(1), before.history);
            },
        );
    }
    await t.step(
        "clean explicit Ctrl+S retains manual save and version semantics",
        async () => {
            await editor.getByRole("tab", { name: "源码", exact: true })
                .click();
            const before = await readState();
            const response = saved("manual");
            await editor.locator("textarea.note-body-textarea").press(
                "Control+s",
            );
            assertEquals((await response).status(), 200);
            await settled();
            const after = await readState();
            assertEquals(after.note.version, before.note.version + 1);
            assertEquals(after.history, before.history);
        },
    );
    await t.step(
        "title composition blocks Enter, commands and blur; committed title autosaves",
        async () => {
            const count = writes.length;
            await title.focus();
            await title.dispatchEvent("compositionstart");
            await title.fill("中文组合标题");
            await title.dispatchEvent("keydown", {
                key: "Enter",
                isComposing: true,
            });
            assertEquals(
                await title.evaluate((el) => el === document.activeElement),
                true,
            );
            await editor.getByRole("button", { name: "粗体", exact: true })
                .click();
            await editor.getByRole("radio").first().focus();
            await page.waitForTimeout(1800);
            assertEquals(writes.length, count);
            const response = saved("autosave");
            await title.dispatchEvent("compositionend");
            assertEquals((await response).status(), 200);
            await settled();
            assertEquals((await readState()).note.title, "中文组合标题");
        },
    );
    await t.step(
        "unmounted editor cannot flush; restored dirty draft flushes on real leave without a timer",
        async () => {
            const count = writes.length;
            await title.fill("关闭后恢复");
            await page.locator(
                'button[aria-label="关闭便签"], button[aria-label="返回上一级"]',
            ).first().click();
            await editor.waitFor({ state: "detached" });
            await page.waitForTimeout(1800);
            assertEquals(writes.length, count);
            await page.locator(".notes-workspace-list .note-title").filter({
                hasText: "中文组合标题",
            }).click();
            await live.waitFor();
            assertEquals(await title.inputValue(), "关闭后恢复");
            await page.waitForTimeout(1800);
            assertEquals(writes.length, count);
            await title.focus();
            const response = saved("manual");
            await editor.getByRole("button", { name: "版本历史", exact: true })
                .click();
            assertEquals((await response).status(), 200);
            await settled();
            await page.waitForTimeout(1800);
            assertEquals(writes.length, count + 1);
            assertEquals((await readState()).note.title, "关闭后恢复");
        },
    );
    await t.step(
        "failed title flush stays dirty and can retry through real leave",
        async () => {
            const before = await readState();
            await page.route(
                `**/api/notes/${id}`,
                (route) =>
                    route.request().method() === "PATCH"
                        ? route.abort()
                        : route.continue(),
            );
            try {
                await title.fill("失败后重试");
                await editor.getByRole("button", {
                    name: "版本历史",
                    exact: true,
                }).click();
                await editor.locator(".save-state.save-error").waitFor();
                assertEquals(await readState(), before);
            } finally {
                await page.unroute(`**/api/notes/${id}`);
            }
            await title.focus();
            const response = saved("manual");
            await editor.getByRole("radio").first().focus();
            assertEquals((await response).status(), 200);
            await settled();
            assertEquals((await readState()).note.title, "失败后重试");
        },
    );
    await t.step(
        "older title response cannot delete newer body draft after immediate close",
        async () => {
            const held = Promise.withResolvers<void>();
            const release = Promise.withResolvers<void>();
            await page.route(`**/api/notes/${id}`, async (route) => {
                if (route.request().method() !== "PATCH") {
                    return route.continue();
                }
                const response = await route.fetch();
                held.resolve();
                await release.promise;
                await route.fulfill({ response });
            });
            try {
                await title.fill("在途标题");
                const response = saved("manual");
                await editor.getByRole("button", {
                    name: "版本历史",
                    exact: true,
                }).click();
                await Promise.race([held.promise, response]);
                await editor.getByRole("tab", { name: "源码", exact: true })
                    .click();
                await editor.locator("textarea.note-body-textarea").fill(
                    "在途请求后的最新正文",
                );
                await page.locator(
                    'button[aria-label="关闭便签"], button[aria-label="返回上一级"]',
                ).first().click();
                await editor.waitFor({ state: "detached" });
                release.resolve();
                assertEquals((await response).status(), 200);
                const card = page.locator(".notes-workspace-list .note-title")
                    .filter({ hasText: "在途标题" });
                await card.waitFor();
                await card.click();
                await live.waitFor();
                await editor.getByRole("tab", { name: "源码", exact: true })
                    .click();
                assertEquals(
                    await editor.locator("textarea.note-body-textarea")
                        .inputValue(),
                    "在途请求后的最新正文",
                );
            } finally {
                release.resolve();
                await page.unroute(`**/api/notes/${id}`);
            }
            const response = saved("manual");
            await editor.locator("textarea.note-body-textarea").focus();
            await editor.getByRole("button", { name: "版本历史", exact: true })
                .click();
            assertEquals((await response).status(), 200);
            await settled();
            assertEquals((await readState()).note.body, "在途请求后的最新正文");
        },
    );
    await t.step(
        "two note instances flush only the dirty instance actually left",
        async () => {
            const secondId = await page.evaluate(async () => {
                await fetch("/api/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ style: "widgets" }),
                });
                const response = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "第二实例",
                        body: "独立正文",
                    }),
                });
                return (await response.json()).data.id as string;
            });
            await page.reload();
            await page.locator('.desktop-dock button[data-workspace="notes"]')
                .click();
            await page.locator(".notes-workspace-list .note-title").filter({
                hasText: "在途标题",
            }).click();
            await page.locator('.desktop-dock button[data-workspace="notes"]')
                .click();
            await page.locator(".notes-workspace-list .note-title").filter({
                hasText: "第二实例",
            }).click();
            const first = page.locator(
                `.desktop-window[data-window-id="note:${id}"] .note-editor`,
            );
            const second = page.locator(
                `.desktop-window[data-window-id="note:${secondId}"] .note-editor`,
            );
            const firstTitle = first.getByRole("textbox", {
                name: "便签标题",
                exact: true,
            });
            const secondTitle = second.getByRole("textbox", {
                name: "便签标题",
                exact: true,
            });
            await first.locator(".ProseMirror").waitFor();
            await second.locator(".ProseMirror").waitFor();
            const secondWrites: string[] = [];
            page.on("request", (request) => {
                if (
                    request.method() === "PATCH" &&
                    request.url().endsWith(`/api/notes/${secondId}`)
                ) secondWrites.push(request.postDataJSON().origin);
            });
            const count = writes.length;
            await firstTitle.fill("第一实例保存");
            const firstSaved = saved("manual");
            await secondTitle.focus();
            assertEquals((await firstSaved).status(), 200);
            await first.locator(".save-state.save-saved").waitFor();
            await page.waitForTimeout(1800);
            assertEquals(writes.length, count + 1);
            assertEquals(secondWrites, []);
            await secondTitle.fill("第二实例保存");
            const secondSaved = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/notes/${secondId}`)
            );
            await firstTitle.focus();
            assertEquals((await secondSaved).status(), 200);
            await second.locator(".save-state.save-saved").waitFor();
            await page.waitForTimeout(1800);
            assertEquals(writes.length, count + 1);
            assertEquals(secondWrites, ["manual"]);
            const titles = await page.evaluate(
                (ids) =>
                    Promise.all(
                        ids.map(async (id) =>
                            (await (await fetch(`/api/notes/${id}`)).json())
                                .data
                                .title as string
                        ),
                    ),
                [id, secondId],
            );
            assertEquals(titles, ["第一实例保存", "第二实例保存"]);
        },
    );
});
