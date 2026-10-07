import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { chromium } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

Deno.test("M0B production editable pagination preserves state, boundaries and IME", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const temp = await Deno.makeTempDir();
    cleanup.defer(() => Deno.remove(temp, { recursive: true }));
    const store = openDatabase(":memory:");
    cleanup.defer(() => store.close());
    await migrateDatabase(store);
    const server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (request) => app.fetch(request),
    );
    cleanup.defer(() => server.shutdown());
    const origin = `http://127.0.0.1:${server.addr.port}`;
    const app = createApp({
        store,
        origin,
        auth: new AuthService({ store, origin }),
        settings: new SystemSettingsStore(":memory:"),
        wallpaper: new WallpaperService(`${temp}/wallpapers`),
        icons: new WebAppIconService(`${temp}/icons`),
    });
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        permissions: ["clipboard-read", "clipboard-write"],
    });
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    const errors: string[] = [];
    const requested: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requested.push(request.url()));
    const rich = page.getByRole("textbox", { name: "分页正文", exact: true });
    const canonical = page.getByTestId("pagination-canonical");
    const layout = page.getByTestId("pagination-layout");
    const viewport = page.getByTestId("pagination-viewport");
    const manifest: Record<string, { file: string; name?: string }> = JSON
        .parse(
            await Deno.readTextFile("web/dist/manifest.json"),
        );
    const editorVendor = Object.values(manifest).find((chunk) =>
        chunk.name === "editor-vendor"
    );
    assert(editorVendor);

    assert(
        await t.step(
            "runtime loads only on open; continuous/page keep DOM, selection and history",
            async () => {
                await page.goto(`${origin}/design-lab/editable-pagination`);
                await page.getByRole("button", {
                    name: "打开编辑器",
                    exact: true,
                })
                    .waitFor();
                assert(
                    !requested.some((url) => url.endsWith(editorVendor.file)),
                );
                await page.getByRole("button", {
                    name: "打开编辑器",
                    exact: true,
                })
                    .click();
                await rich.waitFor();
                assert(
                    requested.some((url) => url.endsWith(editorVendor.file)),
                );
                const original = await canonical.textContent();
                const element = await rich.elementHandle();
                assert(element);
                await rich.click();
                await page.keyboard.press("Control+End");
                await page.keyboard.insertText("内容锚点");
                await page.waitForFunction(() =>
                    document.querySelector(
                        '[data-testid="pagination-canonical"]',
                    )
                        ?.textContent?.includes("内容锚点")
                );
                await page.keyboard.press("Shift+ArrowLeft");
                await page.keyboard.press("Shift+ArrowLeft");
                assertEquals(
                    await page.evaluate(() => getSelection()?.toString()),
                    "锚点",
                );
                const edited = await canonical.textContent();
                await page.getByRole("button", {
                    name: "页面模式",
                    exact: true,
                })
                    .click();
                await page.waitForFunction(() =>
                    document.querySelector('[data-testid="pagination-layout"]')
                        ?.getAttribute("data-mode") === "page"
                );
                assertEquals(await canonical.textContent(), edited);
                assert(
                    await element.evaluate((node) =>
                        node ===
                            document.querySelector('[aria-label="分页正文"]')
                    ),
                );
                assertEquals(
                    await page.evaluate(() => getSelection()?.toString()),
                    "锚点",
                );
                await page.getByRole("button", {
                    name: "连续模式",
                    exact: true,
                })
                    .click();
                assertEquals(await canonical.textContent(), edited);
                await page.getByRole("button", { name: "撤销", exact: true })
                    .click();
                await page.waitForFunction(() =>
                    !document.querySelector(
                        '[data-testid="pagination-canonical"]',
                    )
                        ?.textContent?.includes("内容锚点")
                );
                assertEquals(await canonical.textContent(), original);
                await page.getByRole("button", { name: "重做", exact: true })
                    .click();
                await page.waitForFunction(() =>
                    document.querySelector(
                        '[data-testid="pagination-canonical"]',
                    )
                        ?.textContent?.includes("内容锚点")
                );
            },
        ),
    );

    assert(
        await t.step(
            "manual start/consecutive/end breaks retain blank pages; gaps cannot receive a caret",
            async () => {
                await page.getByLabel("测试内容", { exact: true }).selectOption(
                    "manual",
                );
                await page.getByRole("button", {
                    name: "载入测试内容",
                    exact: true,
                }).click();
                await page.getByRole("button", {
                    name: "页面模式",
                    exact: true,
                })
                    .click();
                const markdown = await canonical.textContent() ?? "";
                const breaks =
                    markdown.match(/^<!-- pagebreak -->$/gm)?.length ??
                        0;
                assert(breaks >= 3);
                assert(markdown.trim().startsWith("<!-- pagebreak -->"));
                assert(markdown.trim().endsWith("<!-- pagebreak -->"));
                await page.waitForFunction(
                    (expected) =>
                        Number(
                            document.querySelector(
                                '[data-testid="pagination-layout"]',
                            )?.getAttribute("data-pages"),
                        ) === expected,
                    breaks + 1,
                );
                assertEquals(await canonical.textContent(), markdown);
                await viewport.scrollIntoViewIfNeeded();
                await viewport.evaluate((node) => {
                    node.scrollLeft = 0;
                });
                const gap = await viewport.evaluate((node) => {
                    const bounds = node.getBoundingClientRect();
                    const pages = [
                        ...node.querySelectorAll("[data-pagination-page]"),
                    ].map((paper) => paper.getBoundingClientRect());
                    for (let i = 1; i < pages.length; i++) {
                        const x = (pages[i - 1].right + pages[i].left) / 2;
                        if (x > bounds.left && x < bounds.right) {
                            return {
                                x,
                                y: Math.max(bounds.top, pages[i].top) + 100,
                            };
                        }
                    }
                    return null;
                });
                assert(
                    gap,
                    "A page gap must be visible within the local paper viewport",
                );
                const beforeSelection = await page.evaluate(() => {
                    const selection = getSelection();
                    return {
                        anchor: selection?.anchorNode?.textContent,
                        offset: selection?.anchorOffset,
                        focus: selection?.focusNode?.textContent,
                        focusOffset: selection?.focusOffset,
                    };
                });
                await page.mouse.click(gap.x, gap.y);
                assertEquals(
                    await page.evaluate(() => {
                        const selection = getSelection();
                        return {
                            anchor: selection?.anchorNode?.textContent,
                            offset: selection?.anchorOffset,
                            focus: selection?.focusNode?.textContent,
                            focusOffset: selection?.focusOffset,
                        };
                    }),
                    beforeSelection,
                );
                assertEquals(await canonical.textContent(), markdown);
            },
        ),
    );

    assert(
        await t.step(
            "copy/paste preserves semantic PageBreak without copying page decoration",
            async () => {
                const markdown = await canonical.textContent() ?? "";
                await rich.focus();
                await page.keyboard.press("Control+a");
                await page.keyboard.press("Control+c");
                const copied = await page.evaluate(() =>
                    navigator.clipboard.readText()
                );
                assert(
                    !copied.includes("page gap") && !copied.includes("第 1 页"),
                );
                await page.keyboard.press("Backspace");
                await page.keyboard.press("Control+v");
                await page.waitForFunction(
                    (expected) =>
                        document.querySelector(
                            '[data-testid="pagination-canonical"]',
                        )?.textContent?.trim() === expected,
                    markdown.trim(),
                );
            },
        ),
    );

    assert(
        await t.step(
            "physical paper and margins reflow only after Chinese composition commits",
            async () => {
                await page.getByLabel("纸张", { exact: true }).selectOption(
                    "A4",
                );
                await page.getByLabel("方向", { exact: true }).selectOption(
                    "portrait",
                );
                await page.getByLabel("边距（毫米）", { exact: true }).fill(
                    "20",
                );
                await rich.focus();
                await page.keyboard.press("Control+End");
                const before = await rich.evaluate((node) =>
                    getComputedStyle(node).columnWidth
                );
                const client = await context.newCDPSession(page);
                await client.send("Input.imeSetComposition", {
                    text: "中文分页",
                    selectionStart: 4,
                    selectionEnd: 4,
                });
                await page.getByLabel("边距（毫米）", { exact: true }).evaluate(
                    (node) => {
                        const input = node as HTMLInputElement;
                        Object.getOwnPropertyDescriptor(
                            HTMLInputElement.prototype,
                            "value",
                        )!.set!.call(input, "50");
                        input.dispatchEvent(
                            new Event("input", { bubbles: true }),
                        );
                    },
                );
                assertEquals(
                    await rich.evaluate((node) =>
                        getComputedStyle(node).columnWidth
                    ),
                    before,
                );
                await client.send("Input.insertText", { text: "中文分页" });
                await client.detach();
                await page.waitForFunction(() =>
                    document.querySelector(
                        '[data-testid="pagination-canonical"]',
                    )
                        ?.textContent?.includes("中文分页")
                );
                await page.waitForFunction((previous) => {
                    const node = document.querySelector(
                        '[aria-label="分页正文"]',
                    );
                    return node &&
                        getComputedStyle(node).columnWidth !== previous;
                }, before);
                const edited = await canonical.textContent();
                await page.getByLabel("纸张", { exact: true }).selectOption(
                    "Letter",
                );
                await page.getByLabel("方向", { exact: true }).selectOption(
                    "landscape",
                );
                await page.getByLabel("边距（毫米）", { exact: true }).fill(
                    "5",
                );
                await page.waitForFunction(() =>
                    Number(
                        document.querySelector(
                            '[data-testid="pagination-layout"]',
                        )
                            ?.getAttribute("data-pages"),
                    ) > 0
                );
                assertEquals(await canonical.textContent(), edited);
                assertStringIncludes(edited ?? "", "中文分页");
            },
        ),
    );

    assert(
        await t.step(
            "oversized text/code/table fragment and PNG fits printable box proportionally",
            async () => {
                await page.getByLabel("纸张", { exact: true }).selectOption(
                    "A4",
                );
                await page.getByLabel("方向", { exact: true }).selectOption(
                    "portrait",
                );
                await page.getByLabel("边距（毫米）", { exact: true }).fill(
                    "20",
                );
                await page.getByLabel("测试内容", { exact: true }).selectOption(
                    "oversized",
                );
                await page.getByRole("button", {
                    name: "载入测试内容",
                    exact: true,
                }).click();
                await rich.locator("img[src]").waitFor();
                await page.waitForFunction(() => {
                    const image = document.querySelector<HTMLImageElement>(
                        '[aria-label="分页正文"] img[src]',
                    );
                    return image?.complete && image.naturalWidth > 0;
                });
                const markdown = await canonical.textContent();
                const geometry = await rich.evaluate((node) => {
                    const image = node.querySelector<HTMLImageElement>(
                        "img[src]",
                    )!;
                    const imageBounds = image.getBoundingClientRect();
                    return {
                        imageWidth: imageBounds.width,
                        imageHeight: imageBounds.height,
                        naturalRatio: image.naturalWidth / image.naturalHeight,
                        paragraphs: [...node.querySelectorAll("p")].map((
                            block,
                        ) => block.getClientRects().length),
                        code: [...node.querySelectorAll("pre")].map((block) =>
                            block.getClientRects().length
                        ),
                        tables: [...node.querySelectorAll("table")].map((
                            block,
                        ) => block.getClientRects().length),
                    };
                });
                assert(geometry.imageWidth <= (210 - 40) * 96 / 25.4 + 1);
                assert(geometry.imageHeight <= (297 - 40) * 96 / 25.4 + 1);
                assert(
                    Math.abs(
                        geometry.imageWidth / geometry.imageHeight -
                            geometry.naturalRatio,
                    ) < 0.01,
                );
                assert(geometry.paragraphs.some((fragments) => fragments > 1));
                assert(geometry.code.some((fragments) => fragments > 1));
                assert(geometry.tables.some((fragments) => fragments > 1));
                assertEquals(await canonical.textContent(), markdown);
                assertEquals(
                    await page.evaluate(() =>
                        document.documentElement.scrollWidth
                    ),
                    1440,
                );
                assert(Number(await layout.getAttribute("data-pages")) > 1);
            },
        ),
    );
    assertEquals(errors, []);
});
