import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

Deno.test("apps edit keeps fields and confirmation across hosts and window modes", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill("apps_session");
        await page.locator("#auth-display-name").fill("Session tester");
        await page.locator("#auth-password").fill("Apps-session-password-141!");
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.evaluate(async () => {
            await fetch("/api/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ style: "widgets" }),
            });
            await fetch("/api/webapps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "编辑目标",
                    url: "https://original.invalid/",
                    iconSource: "default",
                    openMode: "global",
                    isPinned: false,
                }),
            });
            await fetch("/api/webapp-groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "编辑目标文件夹", sortOrder: 0 }),
            });
        });
        await page.reload();
        await page.locator('.desktop-dock [data-workspace="apps"]').click();
        await page.locator('.launcher-app:has-text("编辑目标")').click({
            button: "right",
        });
        await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
        await page.locator("#app-url-input").fill("https://edited.invalid/");
        await page.locator("#app-name-input").fill("编辑中的全部字段");
        await page.locator("#app-group-select").selectOption({
            label: "编辑目标文件夹",
        });
        await page.getByRole("switch", { name: "固定到首页", exact: true })
            .click();
        await page.getByRole("tab", { name: "新标签页", exact: true }).click();
        await page.getByRole("button", { name: "更换图标", exact: true })
            .click();
        await page.getByRole("tab", { name: "网络图片", exact: true }).click();
        await page.locator('input[placeholder="https://example.com/icon.png"]')
            .fill("https://unsubmitted.invalid/icon.png");
        await page.getByRole("button", { name: "保存修改", exact: true })
            .click();
        await page.getByRole("alertdialog").waitFor();
        for (
            const width of [767, 768, 767, 1023, 1024, 1023, 1440, 390, 1440]
        ) {
            await page.setViewportSize({ width, height: 900 });
            await page.getByRole("alertdialog").waitFor();
            assertEquals(
                await page.locator("#app-url-input").inputValue(),
                "https://edited.invalid/",
            );
            assertEquals(
                await page.locator("#app-name-input").inputValue(),
                "编辑中的全部字段",
            );
            assertEquals(
                await page.locator("#app-group-select option:checked")
                    .textContent(),
                "编辑目标文件夹",
            );
            assertEquals(
                await page.getByRole("switch", {
                    name: "固定到首页",
                    exact: true,
                    includeHidden: true,
                }).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(
                await page.getByRole("tab", {
                    name: "新标签页",
                    exact: true,
                    includeHidden: true,
                })
                    .getAttribute("aria-selected"),
                "true",
            );
            assertEquals(
                await page.locator(
                    'input[placeholder="https://example.com/icon.png"]',
                ).inputValue(),
                "https://unsubmitted.invalid/icon.png",
            );
        }
        await page.keyboard.press("Escape");
        await page.getByRole("alertdialog").waitFor({ state: "detached" });
        const win = page.locator('.desktop-window[data-window-id="apps"]');
        await win.getByRole("button", { name: "最大化窗口", exact: true })
            .click();
        await win.getByRole("button", { name: "向下还原窗口", exact: true })
            .click();
        await win.getByRole("button", { name: "最小化窗口", exact: true })
            .click();
        await page.locator('.desktop-dock [data-workspace="apps"]').click();
        await page.locator("#app-name-input").waitFor({ state: "visible" });
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "编辑中的全部字段",
        );
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await page.getByRole("alertdialog").waitFor();
        await page.getByRole("button", { name: "继续编辑", exact: true })
            .click();
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "编辑中的全部字段",
        );
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await page.getByRole("button", { name: "放弃修改", exact: true })
            .click();
        await page.locator('.launcher-app:has-text("编辑目标")').waitFor();
    } finally {
        await browser.close();
        await app.close();
    }
});
