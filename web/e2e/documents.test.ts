import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { chromium } from "playwright";
import type { DocumentDto } from "../../src/shared/documents.ts";
import { startProductionApp } from "./helpers/production-app.ts";
import { largeDocumentMarkdown } from "./fixtures/document.ts";
import { waitForDocument } from "./helpers/document-state.ts";

Deno.test("Documents production responsive modes and large-document integrity (#102 M7)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const evidenceDirectory = Deno.env.get("E2E_EVIDENCE_DIR")
        ? await createEvidenceDirectory("documents")
        : undefined;
    async function captureMode(name: string) {
        if (!evidenceDirectory) return;
        await Deno.mkdir(evidenceDirectory, { recursive: true });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(
                document.getAnimations().filter((animation) =>
                    animation.effect?.getComputedTiming().iterations !==
                        Infinity
                ).map((animation) => animation.finished.catch(() => {})),
            );
            await new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve())
                )
            );
        });
        await page.screenshot({ path: `${evidenceDirectory}/${name}.png` });
    }
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requestedJs: string[] = [];
    page.on("request", (request) => {
        if (request.resourceType() === "script") {
            requestedJs.push(request.url());
        }
    });
    async function request<T>(
        path: string,
        method = "GET",
        body?: object,
    ): Promise<T> {
        return await page.evaluate(async ({ path, method, body }) => {
            const response = await fetch(path, {
                method,
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data;
        }, { path, method, body }) as T;
    }
    await page.goto(app.origin + "/register");
    await page.locator("#auth-username").fill("documents_matrix");
    await page.locator("#auth-display-name").fill("Documents Matrix");
    await page.locator("#auth-password").fill("Documents-matrix-102!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(app.origin + "/");
    const doc = await request<DocumentDto>("/api/documents", "POST", {
        title: "长标题笔记 " + "响应式边界".repeat(20),
        body:
            "# 内容锚点\n\n正文与键盘输入。\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\n末页内容\n\n| 项目 | 内容 |\n| --- | --- |\n| 宽表格 | " +
            "long-cell-".repeat(80) + " |",
    });
    assert(
        await t.step(
            "Documents Library stays body-free and does not load editor runtime",
            async () => {
                await page.locator('button[data-workspace="documents"]').first()
                    .click();
                await page.locator("[data-document-id]").waitFor();
                const summaries = await request<
                    { items: Array<Record<string, unknown>> }
                >("/api/documents");
                assert(summaries.items.every((item) => !("body" in item)));
                const manifest: Record<
                    string,
                    { name?: string; file: string }
                > = JSON.parse(
                    await Deno.readTextFile("web/dist/manifest.json"),
                );
                const editorVendor = Object.values(manifest).find((chunk) =>
                    chunk.name === "editor-vendor"
                );
                assert(editorVendor);
                assert(
                    !requestedJs.some((url) => url.endsWith(editorVendor.file)),
                    "opening Library must not download editor runtime",
                );
            },
        ),
    );
    async function resetHome(
        style: "zen" | "widgets",
        theme: "light" | "dark",
    ) {
        // Home's exit flush must finish before changing its persisted layout.
        await page.goto(app.origin + "/settings");
        const { user } = await request<{ user: { id: string } }>(
            "/api/auth/me",
        );
        await page.evaluate(async (userId) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open("searcher-client", 1);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            if (db.objectStoreNames.contains("state")) {
                await new Promise<void>((resolve, reject) => {
                    const tx = db.transaction("state", "readwrite");
                    tx.objectStore("state").delete(
                        `searcher:desktop-layout:v1:${userId}`,
                    );
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            }
            db.close();
        }, user.id);
        await request("/api/preferences", "PATCH", { style, theme });
        await page.goto(app.origin + "/");
        await page.waitForFunction(
            (theme) => document.documentElement.dataset.theme === theme,
            theme,
        );
        await page.locator('button[data-workspace="documents"]').first()
            .click();
        await page.locator(`[data-document-id="${doc.id}"] h4 button`).click();
        await page.getByRole("textbox", { name: "文档标题", exact: true })
            .waitFor();
    }
    for (
        const [width, height] of [[390, 844], [768, 1024], [1024, 768], [
            1440,
            900,
        ]]
    ) {
        for (const style of ["zen", "widgets"] as const) {
            for (const theme of ["light", "dark"] as const) {
                assert(
                    await t.step(
                        `${width}x${height} ${style} ${theme}: modes, overflow and Host boundary`,
                        async () => {
                            await page.setViewportSize({ width, height });
                            await page.emulateMedia({
                                colorScheme: theme,
                                reducedMotion: "reduce",
                            });
                            await resetHome(style, theme);
                            const entityCount = await page.locator(
                                '[data-window-id^="document:"]',
                            ).count();
                            assertEquals(
                                entityCount,
                                style === "widgets" && width >= 1024 ? 1 : 0,
                            );
                            const initialBody = await request<DocumentDto>(
                                `/api/documents/${doc.id}`,
                            );
                            await page.getByRole("button", {
                                name: "连续",
                                exact: true,
                            }).click();
                            const editor = page.locator(".ProseMirror");
                            await editor.waitFor();
                            assertStringIncludes(
                                await editor.textContent() ?? "",
                                "内容锚点",
                            );
                            await captureMode(
                                `${width}x${height}-${style}-${theme}-continuous`,
                            );
                            const element = await editor.elementHandle();
                            assert(element);
                            await page.getByRole("button", {
                                name: "页面",
                                exact: true,
                            }).click();
                            await page.waitForFunction(() =>
                                !!document.querySelector(
                                    '[data-pagination-mode="page"][data-page-count]',
                                )
                            );
                            assert(
                                await element.evaluate((node) =>
                                    node ===
                                        document.querySelector(".ProseMirror")
                                ),
                                "mode switch must retain the editing instance",
                            );
                            await captureMode(
                                `${width}x${height}-${style}-${theme}-page`,
                            );
                            await page.getByRole("button", {
                                name: "源码",
                                exact: true,
                            }).click();
                            const source = page.getByRole("textbox", {
                                name: "Markdown 源码正文",
                                exact: true,
                            });
                            await source.waitFor();
                            assertEquals(
                                await source.inputValue(),
                                initialBody.body,
                            );
                            await captureMode(
                                `${width}x${height}-${style}-${theme}-source`,
                            );
                            await page.getByRole("button", {
                                name: "连续",
                                exact: true,
                            }).click();
                            assertEquals(
                                (await request<DocumentDto>(
                                    `/api/documents/${doc.id}`,
                                )).version,
                                initialBody.version,
                                "view switching must not create a save",
                            );
                            assert(
                                await page.evaluate(() =>
                                    document.documentElement.scrollWidth <=
                                        innerWidth + 1
                                ),
                                "viewport must not scroll horizontally",
                            );
                        },
                    ),
                );
            }
        }
    }
    assert(
        await t.step(
            "short viewport keeps the focused source text visible and saves typed content",
            async () => {
                await page.setViewportSize({ width: 390, height: 400 });
                await resetHome("widgets", "dark");
                await page.getByRole("button", { name: "源码", exact: true })
                    .click();
                const source = page.getByRole("textbox", {
                    name: "Markdown 源码正文",
                    exact: true,
                });
                await source.focus();
                const visibleHeight = await source.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    let top = Math.max(0, rect.top),
                        bottom = Math.min(innerHeight, rect.bottom);
                    for (
                        let parent = element.parentElement;
                        parent;
                        parent = parent.parentElement
                    ) {
                        if (getComputedStyle(parent).overflowY !== "visible") {
                            const clip = parent.getBoundingClientRect();
                            top = Math.max(top, clip.top);
                            bottom = Math.min(bottom, clip.bottom);
                        }
                    }
                    return bottom - top;
                });
                assert(
                    visibleHeight >= 24,
                    "focused source needs at least one visible text line, not a zero-height clipped viewport",
                );
                await page.keyboard.press("Control+End");
                await page.keyboard.insertText("短屏输入锚点");
                await page.keyboard.press("Control+s");
                await waitForDocument(
                    page,
                    doc.id,
                    (document) => document.body.endsWith("短屏输入锚点"),
                );
                assertStringIncludes(
                    (await request<DocumentDto>("/api/documents/" + doc.id))
                        .body,
                    "短屏输入锚点",
                );
            },
        ),
    );
    assert(
        await t.step(
            "100k Markdown / 200 headings / 50 images / 20 tables / 30 breaks survive input, page and source",
            async () => {
                await page.setViewportSize({ width: 1440, height: 900 });
                await resetHome("widgets", "light");
                // Close the existing editor before seeding a separate long document.
                await page.getByRole("button", {
                    name: "关闭笔记",
                    exact: true,
                }).click();
                const large = await request<DocumentDto>(
                    "/api/documents",
                    "POST",
                    { title: "大文档边界" },
                );
                const asset = await page.evaluate(async (id) => {
                    const bytes = Uint8Array.from(
                        atob(
                            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgXkAAAAASUVORK5CYII=",
                        ),
                        (c) => c.charCodeAt(0),
                    );
                    const form = new FormData();
                    form.append(
                        "file",
                        new File([bytes], "fixture.png", { type: "image/png" }),
                    );
                    const response = await fetch(
                        `/api/documents/${id}/assets`,
                        { method: "POST", body: form },
                    );
                    if (!response.ok) throw new Error(await response.text());
                    return (await response.json()).data as { assetId: string };
                }, large.id);
                const body = largeDocumentMarkdown(asset.assetId);
                assert(body.length >= 100000);
                await request(`/api/documents/${large.id}`, "PATCH", {
                    body,
                    version: large.version,
                });
                await page.reload();
                await page.getByRole("button", {
                    name: "笔记工作区",
                    exact: true,
                }).click();
                await page.locator(`[data-document-id="${large.id}"] h4 button`)
                    .click();
                const editor = page.locator(".ProseMirror");
                await editor.waitFor();
                assertEquals(await editor.locator("h2").count(), 200);
                assertEquals(
                    await editor.locator("img[data-canonical-src]").count(),
                    50,
                );
                assertEquals(await editor.locator("table").count(), 20);
                await editor.click();
                await page.keyboard.press("Control+End");
                await page.keyboard.insertText(" 长文编辑锚点");
                await page.waitForFunction(() =>
                    document.querySelector(".ProseMirror")?.textContent
                        ?.endsWith("长文编辑锚点")
                );
                await page.keyboard.press("Control+s");
                await waitForDocument(
                    page,
                    large.id,
                    (document) =>
                        document.body.trimEnd().endsWith("长文编辑锚点"),
                );
                const saved = await request<DocumentDto>(
                    `/api/documents/${large.id}`,
                );
                assertEquals(
                    saved.body.match(/<!-- pagebreak -->/g)?.length,
                    30,
                );
                assertEquals(saved.body.match(/asset:\/\//g)?.length, 50);
                await page.getByRole("button", { name: "页面", exact: true })
                    .click();
                await page.waitForFunction(() =>
                    Number(
                        document.querySelector('[data-pagination-mode="page"]')
                            ?.getAttribute("data-page-count"),
                    ) >= 31
                );
                await page.getByRole("button", { name: "源码", exact: true })
                    .click();
                assertEquals(
                    await page.getByRole("textbox", {
                        name: "Markdown 源码正文",
                        exact: true,
                    }).inputValue(),
                    saved.body,
                );
                await page.getByRole("button", { name: "连续", exact: true })
                    .click();
                await editor.waitFor();
                await page.waitForFunction(() =>
                    document.querySelectorAll(".ProseMirror h2").length === 200
                );
                assertEquals(await editor.locator("h2").count(), 200);
                assertEquals(await editor.locator("table").count(), 20);
                assertStringIncludes(
                    await editor.textContent() ?? "",
                    "长文编辑锚点",
                );
                assertEquals(
                    (await request<DocumentDto>(`/api/documents/${large.id}`))
                        .body,
                    saved.body,
                );
            },
        ),
    );
    assertEquals(errors, []);
});
