import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

Deno.test("guests see no AI entry on home; a conversation link signs in and returns to it #196 #237", async () => {
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
        await page.goto(app.origin + "/?source=guest-ai");
        await page.locator("main.home").waitFor({ state: "visible" });
        await page.locator("#search-query").waitFor({ state: "visible" });
        assertEquals(
            await page.getByRole("link", { name: "AI 问答", exact: true })
                .count(),
            0,
            "no top-bar AI link for guests",
        );
        await page.locator(".search-engine").click();
        await page.getByRole("menuitemradio").first().waitFor();
        assertEquals(
            await page.getByRole("menuitemradio", { name: "AI 问答" }).count(),
            0,
            "no AI target in the engine menu",
        );
        await page.keyboard.press("Escape");
        const search = page.locator("#search-query");
        await search.fill("/ai guest submit contract");
        await search.press("Alt+Enter");
        assertEquals(await page.getByText("问 AI：").count(), 0);
        assertEquals(
            await page.getByRole("region", { name: "AI 回答" }).count(),
            0,
        );
        assertEquals(new URL(page.url()).pathname, "/");

        // A conversation deep link still asks a guest to sign in, then returns to it.
        const conversation = `/ask/${credentials.conversationId}`;
        await page.goto(app.origin + conversation);
        const login = page.getByRole("link", { name: "登录后提问" });
        await login.waitFor({ state: "visible" });
        assertEquals(
            await login.getAttribute("href"),
            `/login?next=${encodeURIComponent(conversation)}`,
        );
        await login.click();
        await page.locator("#auth-username").fill(credentials.username);
        await page.locator("#auth-password").fill(credentials.password);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + conversation);
        await page.locator(".ask-assistant-body").first().waitFor({
            state: "visible",
        });
    } finally {
        await browser.close();
        await app.close();
    }
});
