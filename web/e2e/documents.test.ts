import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import type { DocumentDto } from "../../src/shared/documents.ts";
import { startProductionApp } from "./helpers/production-app.ts";
import { largeDocumentMarkdown } from "./fixtures/document.ts";
import { waitForDocument } from "./helpers/document-state.ts";
import { openNoteRows } from "./helpers/library.ts";

Deno.test("Documents production responsive modes and large-document integrity (#102 M7)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        handleSIGTERM: false,
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
                await openNoteRows(page);
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
    async function resetHome(theme: "light" | "dark") {
        // Leave home first so its exit flush finishes before preferences change.
        await page.goto(app.origin + "/settings");
        await request("/api/preferences", "PATCH", { theme });
        await page.goto(app.origin + "/");
        await page.waitForFunction(
            (theme) => document.documentElement.dataset.theme === theme,
            theme,
        );
        await openNoteRows(page);
        await page.locator(`[data-document-id="${doc.id}"] h4 button`).click();
        await page.getByRole("textbox", { name: "笔记标题", exact: true })
            .waitFor();
    }
    for (
        const [width, height] of [[390, 844], [768, 1024], [1024, 768], [
            1440,
            900,
        ]]
    ) {
        for (const theme of ["light", "dark"] as const) {
            assert(
                await t.step(
                    `${width}x${height} ${theme}: modes, overflow and library boundary`,
                    async () => {
                        await page.setViewportSize({ width, height });
                        await page.emulateMedia({
                            colorScheme: theme,
                            reducedMotion: "reduce",
                        });
                        await resetHome(theme);
                        await page.locator('[data-library="notes"]').waitFor();
                        if (width < 768) {
                            const frame = page.locator(
                                '[data-window-id="notes"]',
                            );
                            await frame.waitFor({ state: "visible" });
                            assertEquals(
                                await page.locator(
                                    "[data-window-id]:not([hidden])",
                                ).count(),
                                1,
                                "a narrow viewport shows a single active window",
                            );
                            const box = await frame.boundingBox();
                            assert(box);
                            assert(
                                box.x >= 0 && box.y >= 0 &&
                                    box.x + box.width <= width &&
                                    box.y + box.height <= height,
                                "the narrow window stays inside the viewport",
                            );
                        } else {
                            assertEquals(
                                await page.locator("#search-query").evaluate((
                                    node,
                                ) => Boolean(node.closest("[inert]"))),
                                false,
                                "desktop library must leave the home interactive",
                            );
                        }
                        const initialBody = await request<DocumentDto>(
                            `/api/documents/${doc.id}`,
                        );
                        await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                        await page.getByRole("button", {
                            name: "编辑",
                            exact: true,
                        }).click();
                        const editor = page.locator(".ProseMirror");
                        await editor.waitFor();
                        assertStringIncludes(
                            await editor.textContent() ?? "",
                            "内容锚点",
                        );
                        await captureMode(
                            `${width}x${height}-${theme}-continuous`,
                        );
                        const element = await editor.elementHandle();
                        assert(element);
                        await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                        await page.getByRole("button", {
                            name: "分页",
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
                            `${width}x${height}-${theme}-page`,
                        );
                        await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                        await page.getByRole("button", {
                            name: "Markdown 源码",
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
                            `${width}x${height}-${theme}-source`,
                        );
                        await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                        await page.getByRole("button", {
                            name: "编辑",
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
    assert(
        await t.step(
            "390px document toolbar keeps a single keyboard entry and caret clear of the viewport edge",
            async () => {
                await page.setViewportSize({ width: 390, height: 844 });
                await resetHome("dark");
                await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                await page.getByRole("button", {
                    name: "编辑",
                    exact: true,
                }).click();
                const formatToggle = page.getByRole("button", {
                    name: "显示格式工具栏",
                    exact: true,
                });
                if (await formatToggle.count()) await formatToggle.click();
                const toolbar = page.getByRole("toolbar", {
                    name: "笔记编辑格式工具栏",
                    exact: true,
                });
                await toolbar.waitFor({ state: "visible" });
                await page.getByRole("button", {
                    name: "切换编辑模式，当前：编辑",
                    exact: true,
                }).waitFor({ state: "visible" });

                const toolbarGeometry = await toolbar.evaluate((element) => {
                    const buttons = Array.from(
                        element.querySelectorAll<HTMLButtonElement>("button"),
                    );
                    return {
                        width: element.clientWidth,
                        scrollWidth: element.scrollWidth,
                        rowCount: new Set(
                            buttons.map((button) =>
                                Math.round(button.getBoundingClientRect().top)
                            ),
                        ).size,
                        tabStopCount: buttons.filter((button) =>
                            !button.disabled && button.tabIndex === 0
                        ).length,
                        titleMismatchCount: buttons.filter((button) =>
                            button.title !== button.getAttribute("aria-label")
                        ).length,
                        hasInternalPagebreakLabel: buttons.some((button) =>
                            button.title.includes("<!--")
                        ),
                    };
                });
                assert(
                    toolbarGeometry.scrollWidth > toolbarGeometry.width,
                    "390px toolbar should expose its remaining commands through horizontal scrolling",
                );
                assertEquals(toolbarGeometry.rowCount, 1);
                assertEquals(toolbarGeometry.tabStopCount, 1);
                assertEquals(toolbarGeometry.titleMismatchCount, 0);
                assertEquals(toolbarGeometry.hasInternalPagebreakLabel, false);

                const headerTargets = await page.locator(
                    ".document-editor-header button",
                ).evaluateAll((buttons) => {
                    const target = Number.parseFloat(
                        getComputedStyle(document.documentElement)
                            .getPropertyValue("--control-touch-target"),
                    );
                    return buttons.map((button) => {
                        const rect = (button as HTMLElement)
                            .getBoundingClientRect();
                        return rect.width >= target - 1 &&
                            rect.height >= target - 1;
                    });
                });
                assert(
                    headerTargets.length > 0 && headerTargets.every(Boolean),
                    "coarse-width header buttons must meet the shared touch target",
                );

                await page.getByRole("button", {
                    name: "更多笔记操作",
                    exact: true,
                }).focus();
                await page.keyboard.press("Tab");
                assertEquals(
                    await page.evaluate(() =>
                        (document.activeElement as HTMLElement | null)
                            ?.getAttribute("aria-label")
                    ),
                    "撤销",
                    "Tab should enter the toolbar through its sole tab stop",
                );
                await page.keyboard.press("ArrowRight");
                assertEquals(
                    await page.evaluate(() =>
                        (document.activeElement as HTMLElement | null)
                            ?.getAttribute("aria-label")
                    ),
                    "重做",
                    "right arrow should move focus within the toolbar",
                );
                await page.keyboard.press("Tab");
                assertEquals(
                    await toolbar.evaluate((element) =>
                        element.contains(document.activeElement)
                    ),
                    false,
                    "Tab should leave the toolbar after its single roving stop",
                );

                const editor = page.locator(".ProseMirror");
                await editor.focus();
                await page.keyboard.press("Control+End");
                await page.keyboard.insertText(" 菜单焦点草稿");
                await page.waitForFunction(() =>
                    document.querySelector(".document-save-status")
                        ?.getAttribute("data-status") === "dirty"
                );
                const more = page.getByRole("button", {
                    name: "更多笔记操作",
                    exact: true,
                });
                await more.focus();
                await page.keyboard.press("Enter");
                const menu = page.getByRole("menu");
                await menu.waitFor({ state: "visible" });
                assertEquals(
                    await page.locator(".document-save-status")
                        .getAttribute("data-status"),
                    "dirty",
                    "opening More must not flush an in-progress draft",
                );
                for (
                    const name of [
                        "纸张设置",
                        "打印或另存为 PDF",
                        "复制 Markdown 正文（不含标题）",
                        "导出 Markdown 文件",
                    ]
                ) {
                    await page.getByRole("menuitem", { name, exact: true })
                        .waitFor({ state: "visible" });
                }
                await page.getByRole("button", { name: "大纲", exact: true })
                    .waitFor({ state: "visible" });
                await page.getByRole("button", { name: "历史", exact: true })
                    .waitFor({ state: "visible" });
                await page.keyboard.press("Escape");
                await menu.waitFor({ state: "hidden" });
                assertEquals(
                    await page.locator(".document-save-status")
                        .getAttribute("data-status"),
                    "dirty",
                    "dismissing More must leave the in-progress draft unsaved",
                );

                await editor.locator("h1").first().click();
                await page.keyboard.press("Home");
                await page.keyboard.press("Shift+End");
                const bold = toolbar.getByRole("button", {
                    name: "粗体",
                    exact: true,
                });
                await bold.click();
                await page.waitForFunction(() =>
                    document.querySelector<HTMLButtonElement>(
                        '[role="toolbar"] button[aria-label="粗体"]',
                    )?.getAttribute("aria-pressed") === "true"
                );
                await editor.focus();
                await page.keyboard.press("Control+End");
                await page.keyboard.press("Shift+ArrowLeft");
                await page.setViewportSize({ width: 390, height: 360 });
                await page.waitForFunction(() => {
                    const viewport = globalThis.visualViewport;
                    const workspace = document.querySelector<HTMLElement>(
                        '[data-window-id="notes"]',
                    );
                    if (!viewport || !workspace) return false;
                    const rect = workspace.getBoundingClientRect();
                    return rect.height > 0 &&
                        rect.top >= viewport.offsetTop - 1 &&
                        rect.bottom <= viewport.offsetTop + viewport.height + 1;
                });
                const viewportGeometryIsReady = () => {
                    const toolbar = document.querySelector<HTMLElement>(
                        '[role="toolbar"]',
                    );
                    const viewport = globalThis.visualViewport;
                    const selection = globalThis.getSelection();
                    const caret = selection?.rangeCount
                        ? selection.getRangeAt(0).getBoundingClientRect()
                        : null;
                    if (!toolbar || !viewport || !caret) return false;

                    const toolbarRect = toolbar.getBoundingClientRect();
                    const viewportBottom = viewport.offsetTop +
                        viewport.height;
                    return toolbarRect.top >= viewport.offsetTop - 1 &&
                        toolbarRect.bottom <= viewportBottom + 1 &&
                        caret.top >= toolbarRect.bottom - 1 &&
                        caret.bottom <= viewportBottom + 1;
                };
                try {
                    await page.waitForFunction(
                        viewportGeometryIsReady,
                        undefined,
                        { timeout: 5000 },
                    );
                } catch (error) {
                    const diagnostics = await page.evaluate(() => {
                        const toolbar = document.querySelector<HTMLElement>(
                            '[role="toolbar"]',
                        );
                        const viewport = globalThis.visualViewport;
                        const selection = globalThis.getSelection();
                        const caret = selection?.rangeCount
                            ? selection.getRangeAt(0).getBoundingClientRect()
                            : null;
                        const hit = caret
                            ? document.elementFromPoint(
                                caret.left + caret.width / 2,
                                caret.top + caret.height / 2,
                            )
                            : null;
                        const selectors = [
                            '[data-window-id="notes"]',
                            ".workspace-body",
                            ".document-editor-container",
                            ".document-editor-header",
                            ".document-editor-toolbar",
                            ".document-editor-content-layout",
                            ".document-editor-scroll-area",
                            ".ProseMirror",
                        ];
                        return {
                            viewport: viewport && {
                                offsetTop: viewport.offsetTop,
                                height: viewport.height,
                                bottom: viewport.offsetTop + viewport.height,
                            },
                            toolbar: toolbar?.getBoundingClientRect().toJSON(),
                            caret: caret?.toJSON(),
                            caretHit: hit && {
                                tag: hit.tagName,
                                className: hit.getAttribute("class"),
                                ariaLabel: hit.getAttribute("aria-label"),
                            },
                            activeElement: document.activeElement && {
                                tag: document.activeElement.tagName,
                                className: document.activeElement.getAttribute(
                                    "class",
                                ),
                            },
                            scrollChain: selectors.map((selector) => {
                                const element = document.querySelector<
                                    HTMLElement
                                >(selector);
                                if (!element) {
                                    return { selector, missing: true };
                                }
                                const rect = element.getBoundingClientRect();
                                const style = getComputedStyle(element);
                                return {
                                    selector,
                                    rect: rect.toJSON(),
                                    scrollTop: element.scrollTop,
                                    scrollHeight: element.scrollHeight,
                                    clientHeight: element.clientHeight,
                                    overflowY: style.overflowY,
                                    position: style.position,
                                };
                            }),
                        };
                    });
                    const screenshotDirectory = evidenceDirectory ??
                        await Deno.makeTempDir({
                            prefix: "documents-viewport-failure-",
                        });
                    await Deno.mkdir(screenshotDirectory, {
                        recursive: true,
                    });
                    const screenshotPath =
                        `${screenshotDirectory}/toolbar-viewport.png`;
                    await page.screenshot({ path: screenshotPath });
                    throw new Error(
                        `视口几何未在 5000ms 内稳定：${
                            JSON.stringify(diagnostics)
                        }；截图：${screenshotPath}；${String(error)}`,
                    );
                }

                const visibleGeometry = await page.evaluate(() => {
                    const toolbar = document.querySelector<HTMLElement>(
                        '[role="toolbar"]',
                    );
                    const viewport = globalThis.visualViewport;
                    const selection = globalThis.getSelection();
                    const caret = selection?.rangeCount
                        ? selection.getRangeAt(0).getBoundingClientRect()
                        : null;
                    const workspace = document.querySelector<HTMLElement>(
                        '[data-window-id="notes"]',
                    );
                    if (!toolbar || !viewport || !caret || !workspace) {
                        return null;
                    }
                    const toolbarRect = toolbar.getBoundingClientRect();
                    const windowRect = workspace.getBoundingClientRect();
                    return {
                        visualTop: viewport.offsetTop,
                        visualBottom: viewport.offsetTop + viewport.height,
                        toolbarTop: toolbarRect.top,
                        toolbarBottom: toolbarRect.bottom,
                        caretTop: caret.top,
                        caretBottom: caret.bottom,
                        windowTop: windowRect.top,
                        windowBottom: windowRect.bottom,
                        visualHeight: viewport.height,
                    };
                });
                assert(visibleGeometry);
                assert(
                    visibleGeometry.windowTop >=
                            visibleGeometry.visualTop - 1 &&
                        visibleGeometry.windowBottom <=
                            visibleGeometry.visualBottom + 1,
                    "the notes window should stay inside the visual viewport",
                );
                assert(
                    visibleGeometry.toolbarTop >=
                            visibleGeometry.visualTop - 1 &&
                        visibleGeometry.toolbarBottom <=
                            visibleGeometry.visualBottom + 1,
                    "toolbar should remain inside the reduced visual viewport",
                );
                assert(
                    visibleGeometry.caretTop >=
                            visibleGeometry.toolbarBottom - 1 &&
                        visibleGeometry.caretBottom <=
                            visibleGeometry.visualBottom + 1,
                    "the focused caret should remain visible below the toolbar",
                );

                await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                await page.getByRole("button", {
                    name: "Markdown 源码",
                    exact: true,
                }).click();
                const disabledToolbar = await toolbar.evaluate((element) => ({
                    allDisabled: Array.from(
                        element.querySelectorAll<HTMLButtonElement>("button"),
                    ).every((button) => button.disabled),
                    tabIndex: element.tabIndex,
                }));
                assertEquals(disabledToolbar.allDisabled, true);
                assertEquals(
                    disabledToolbar.tabIndex,
                    0,
                    "a toolbar with no enabled command remains one Tab stop",
                );
            },
        ),
    );
    assert(
        await t.step(
            "short viewport keeps the focused source text visible and saves typed content",
            async () => {
                await page.setViewportSize({ width: 390, height: 400 });
                await resetHome("dark");
                await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                await page.getByRole("button", {
                    name: "Markdown 源码",
                    exact: true,
                })
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
                await resetHome("light");
                // The persistent sidebar can open the next document directly.
                const large = await request<DocumentDto>(
                    "/api/documents",
                    "POST",
                    { title: "长笔记边界" },
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
                await openNoteRows(page);
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
                await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                await page.getByRole("button", { name: "分页", exact: true })
                    .click();
                await page.waitForFunction(() =>
                    Number(
                        document.querySelector('[data-pagination-mode="page"]')
                            ?.getAttribute("data-page-count"),
                    ) >= 31
                );
                await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                await page.getByRole("button", {
                    name: "Markdown 源码",
                    exact: true,
                })
                    .click();
                assertEquals(
                    await page.getByRole("textbox", {
                        name: "Markdown 源码正文",
                        exact: true,
                    }).inputValue(),
                    saved.body,
                );
                await page.getByRole("button", { name: /^切换编辑模式，当前：/ }).click();
                await page.getByRole("button", { name: "编辑", exact: true })
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
