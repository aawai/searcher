import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { chromium } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

Deno.test("M0A production React editor lifecycle, source, IME and isolation", async () => {
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
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/design-lab/markdown-editor`);
    await page.getByRole("button", { name: "打开编辑器", exact: true }).click();
    const rich = page.locator('[aria-label="实例 A正文"]');
    await rich.waitFor();
    const a = page.locator("section").filter({
        has: page.getByRole("heading", { name: "实例 A", exact: true }),
    });
    const canonical = page.getByTestId("实例 A-canonical");
    const baseline = await canonical.textContent();
    assert(baseline);
    await a.getByRole("button", { name: "源码模式", exact: true }).click();
    const source = page.getByRole("textbox", {
        name: "实例 A源码",
        exact: true,
    });
    await source.fill(
        "# 中文标题\n\n源码替换正文。\n\n<!-- pagebreak -->\n\n尾段。",
    );
    await a.getByRole("button", { name: "返回 Live Preview" }).click();
    await rich.locator("h1").filter({ hasText: "中文标题" }).waitFor();
    assertStringIncludes(
        await canonical.textContent() ?? "",
        "<!-- pagebreak -->",
    );
    assertStringIncludes(
        await a.getByRole("status").textContent() ?? "",
        "正文变化 0 次",
    );

    await page.getByRole("button", { name: "打开第二实例" }).click();
    await page.locator('[aria-label="实例 B正文"]').waitFor();
    assertEquals(
        await page.getByTestId("实例 B-canonical").textContent(),
        baseline,
    );

    await rich.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("独立编辑");
    await page.waitForFunction(() =>
        document.querySelector('[data-testid="实例 A-canonical"]')?.textContent
            ?.includes("独立编辑")
    );
    assertEquals(
        await page.getByTestId("实例 B-canonical").textContent(),
        baseline,
    );
    await a.getByRole("button", { name: "撤销", exact: true }).click();
    await page.waitForFunction(() =>
        !document.querySelector('[data-testid="实例 A-canonical"]')?.textContent
            ?.includes("独立编辑")
    );
    await a.getByRole("button", { name: "重做", exact: true }).click();
    await page.waitForFunction(() =>
        document.querySelector('[data-testid="实例 A-canonical"]')?.textContent
            ?.includes("独立编辑")
    );

    await rich.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Shift+ArrowLeft");
    assertEquals(await page.evaluate(() => getSelection()?.toString()), "辑");
    await page.keyboard.insertText("选择替换");
    await page.waitForFunction(() =>
        document.querySelector('[data-testid="实例 A-canonical"]')?.textContent
            ?.includes("独立编选择替换")
    );

    const client = await page.context().newCDPSession(page);
    await client.send("Input.imeSetComposition", {
        text: "中文输入",
        selectionStart: 4,
        selectionEnd: 4,
    });
    await client.send("Input.insertText", { text: "中文输入" });
    await client.detach();
    await page.waitForFunction(() =>
        document.querySelector('[data-testid="实例 A-canonical"]')?.textContent
            ?.includes("独立编选择替换中文输入")
    );
    assertEquals(
        await page.getByTestId("实例 B-canonical").textContent(),
        baseline,
    );

    for (let i = 0; i < 3; i++) {
        await page.getByRole("button", { name: "卸载编辑器", exact: true })
            .click();
        assertEquals(await page.locator(".ProseMirror").count(), 0);
        await page.getByRole("button", { name: "打开编辑器", exact: true })
            .click();
        await rich.waitFor();
        await page.locator('[aria-label="实例 B正文"]').waitFor();
        assertEquals(await page.locator(".ProseMirror").count(), 2);
        assertEquals(await canonical.textContent(), baseline);
    }
    assertEquals(errors, []);
});
