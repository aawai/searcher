import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

Deno.test("guest AI entry links to login and returns home #196", async () => {
    const app = await startProductionApp();
    const credentials = await app.seedAskFixtureUser({
        username: "guest_ai_entry",
        password: "Guest-AI-password-196!",
    });
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        const home = app.origin + "/?source=guest-ai";
        await page.goto(home);
        await page.locator("main.home").waitFor({
            state: "visible",
        });
        await page.locator("#search-query").waitFor({
            state: "visible",
        });
        await page.getByRole("link", { name: "AI 问答", exact: true }).waitFor({
            state: "visible",
        });
        assertEquals(await page.getByText("登录后可用").count(), 0);

        await page.locator(".search-engine").click();
        const aiItem = page.getByRole("menuitem", {
            name: "AI 问答",
            exact: true,
        });
        await aiItem.waitFor({ state: "visible" });
        await aiItem.click();

        let loginLink = page.getByRole("link", {
            name: "去登录",
            exact: true,
        });
        await loginLink.waitFor({ state: "visible" });
        assertEquals(
            await loginLink.getAttribute("href"),
            "/login?next=%2F%3Fsource%3Dguest-ai",
        );

        await page.getByRole("button", { name: "关闭错误提示" }).click();
        const search = page.locator("#search-query");
        await search.fill("/ai guest submit contract");
        await search.press("Enter");
        loginLink = page.getByRole("link", {
            name: "去登录",
            exact: true,
        });
        await loginLink.waitFor({ state: "visible" });
        assertEquals(
            await loginLink.getAttribute("href"),
            "/login?next=%2F%3Fsource%3Dguest-ai",
        );

        await page.setViewportSize({ width: 390, height: 844 });
        const readableMessage = await page.getByText(
            "登录后使用 AI 问答",
            { exact: true },
        ).evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
            return rect.left >= 0 && rect.right <= innerWidth &&
                rect.height <= lineHeight * 2;
        });
        assertEquals(readableMessage, true, "移动错误提示不应被挤成逐字换行");

        await page.getByRole("link", {
            name: "去登录",
            exact: true,
        }).click();
        await page.locator("#auth-username").fill(credentials.username);
        await page.locator("#auth-password").fill(credentials.password);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(home);
        await page.locator("#search-query").waitFor({ state: "visible" });
    } finally {
        await browser.close();
        await app.close();
    }
});
