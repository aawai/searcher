import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

Deno.test("apps ignores obsolete fetches and retains failed saves", async () => {
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
        await page.locator("#auth-username").fill("apps_races");
        await page.locator("#auth-display-name").fill("Race tester");
        await page.locator("#auth-password").fill("Apps-race-password-141!");
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.locator('[data-workspace="apps"]').click();
        await page.getByRole("button", { name: "添加应用", exact: true })
            .click();
        const release = Promise.withResolvers<void>();
        let fetches = 0;
        await page.route("**/api/webapp-icons/fetch", async (route) => {
            fetches++;
            await release.promise;
            await route.fulfill({
                json: {
                    status: true,
                    data: {
                        id: "obsolete",
                        url: "/obsolete.svg",
                        siteName: "自动名称",
                    },
                },
            });
        });
        const request = page.waitForRequest("**/api/webapp-icons/fetch");
        await page.locator("#app-url-input").fill("https://old.invalid/");
        await page.locator("#app-name-input").fill("手动名称");
        await request;
        await page.setViewportSize({ width: 390, height: 640 });
        await page.getByText("正在获取网站信息…", { exact: true }).waitFor();
        await page.getByRole("button", { name: "更换图标", exact: true })
            .click();
        await page.getByRole("tab", { name: "网络图片", exact: true }).click();
        await page.locator('input[placeholder="https://example.com/icon.png"]')
            .fill("https://manual.invalid/icon.png");
        release.resolve();
        await page.getByText("已获取应用名称和网站图标", { exact: true })
            .waitFor();
        assertEquals(fetches, 1);
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "手动名称",
        );
        assertEquals(await page.locator('img[src="/obsolete.svg"]').count(), 0);
        await page.unroute("**/api/webapp-icons/fetch");
        const late = Promise.withResolvers<void>();
        const lateDone = Promise.withResolvers<void>();
        await page.route("**/api/webapp-icons/fetch", async (route) => {
            await late.promise;
            await route.fulfill({
                json: {
                    status: true,
                    data: {
                        id: "late",
                        url: "/late.svg",
                        siteName: "迟到名称",
                    },
                },
            });
            lateDone.resolve();
        });
        const oldRequest = page.waitForRequest("**/api/webapp-icons/fetch");
        await page.locator("#app-url-input").fill("https://abandoned.invalid/");
        await page.locator("#app-name-input").focus();
        await oldRequest;
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await page.getByRole("button", { name: "放弃修改", exact: true })
            .click();
        await page.getByRole("button", { name: "添加应用", exact: true })
            .click();
        await page.locator("#app-name-input").fill("新会话");
        late.resolve();
        await lateDone.promise;
        await page.unroute("**/api/webapp-icons/fetch");
        await page.locator("#app-url-input").fill("https://new.invalid/");
        await page.getByText("未能自动获取应用名称和图标", { exact: false })
            .waitFor();
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "新会话",
        );
        assertEquals(await page.locator('img[src="/late.svg"]').count(), 0);
        await page.route(
            "**/api/webapps",
            (route) =>
                route.fulfill({
                    status: 503,
                    json: { status: false, message: "保存服务暂时不可用" },
                }),
        );
        await page.getByRole("button", { name: "添加应用", exact: true })
            .click();
        await page.getByText(/保存失败/).waitFor();
        await page.setViewportSize({ width: 1440, height: 900 });
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "新会话",
        );
        assertEquals(
            await page.locator("#app-url-input").inputValue(),
            "https://new.invalid/",
        );
        await page.getByText(/保存失败/).waitFor();
        await page.unroute("**/api/webapps");
        // Single-label hosts are savable under the existing URL contract even
        // though automatic metadata detection deliberately does not run.
        let intranetFetches = 0;
        page.on("request", (request) => {
            if (new URL(request.url()).pathname === "/api/webapp-icons/fetch") {
                intranetFetches++;
            }
        });
        await page.locator("#app-url-input").fill("https://intranet/");
        await page.locator("#app-name-input").fill("");
        const saveRelease = Promise.withResolvers<void>();
        let saves = 0;
        await page.route("**/api/webapps", async (route) => {
            if (route.request().method() !== "POST") return route.continue();
            saves++;
            await saveRelease.promise;
            await route.fulfill({ response: await route.fetch() });
        });
        const saveRequest = page.waitForRequest((request) =>
            new URL(request.url()).pathname === "/api/webapps" &&
            request.method() === "POST"
        );
        await page.locator(".app-dialog-form").evaluate((form) => {
            (form as HTMLFormElement).requestSubmit();
            (form as HTMLFormElement).requestSubmit();
        });
        await saveRequest;
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole("button", { name: "保存中…", exact: true })
            .waitFor();
        saveRelease.resolve();
        await page.locator(".apps-workspace-root").waitFor();
        assertEquals(saves, 1);
        assertEquals(intranetFetches, 0);
        const saved = await page.request.get(app.origin + "/api/webapps");
        const result = await saved.json();
        assertEquals(
            result.data.map((item: { name: string; url: string }) => ({
                name: item.name,
                url: item.url,
            })),
            [{ name: "intranet", url: "https://intranet/" }],
        );
    } finally {
        await browser.close();
        await app.close();
    }
});
