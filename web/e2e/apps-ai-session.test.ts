import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

// Controlled provider/candidate responses protect lifecycle races, not real
// provider compatibility or successful image generation.
Deno.test("apps AI snapshot, candidates and selection stay in one session #141", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
            hasTouch: true,
        });
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill("apps_ai_session");
        await page.locator("#auth-display-name").fill("AI session tester");
        await page.locator("#auth-password").fill("Apps-AI-password-141!");
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        let metadataRequests = 0;
        await page.route("**/api/ai/models", (route) => {
            metadataRequests++;
            return route.fulfill({
                json: {
                    status: true,
                    data: [{
                        id: "fixture",
                        providerId: "provider",
                        modelId: "fixture-image",
                        displayName: "Controlled image fixture",
                        enabled: true,
                        visibleToUsers: true,
                    }],
                },
            });
        });
        await page.route(
            "**/api/ai/providers",
            (route) =>
                route.fulfill({
                    json: {
                        status: true,
                        data: [{
                            id: "provider",
                            name: "Controlled provider",
                            baseUrl: "https://provider.invalid",
                        }],
                    },
                }),
        );
        await page.locator('[data-workspace="apps"]').click();
        await page.getByRole("button", { name: "添加应用", exact: true })
            .click();
        await page.locator("#app-name-input").fill("AI 会话草稿");
        await page.getByRole("button", { name: "更换图标", exact: true })
            .click();
        await page.getByRole("tab", { name: "AI 生成", exact: true }).click();
        await page.locator("#ai-description-input").fill("保留用途描述");
        await page.locator("#ai-style-select").selectOption("geometric");
        for (
            const id of [
                "ai-model-select",
                "ai-style-select",
                "ai-image-protocol",
            ]
        ) {
            const rect = await page.locator(`#${id}`).evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                return { width: bounds.width, height: bounds.height };
            });
            assertEquals(
                rect.width >= 44 && rect.height >= 44,
                true,
                `${id} must be touch-accessible`,
            );
        }
        await page.getByRole("button", { name: "生成 3 个候选", exact: true })
            .click();
        await page.getByRole("alertdialog").waitFor();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole("alertdialog").getByText("保留用途描述", {
            exact: true,
        }).waitFor();
        const generated = Promise.withResolvers<void>();
        const png = await page.evaluate(() => {
            const canvas = document.createElement("canvas");
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "blue";
            ctx.fillRect(0, 0, 64, 64);
            return canvas.toDataURL("image/png");
        });
        let generations = 0;
        await page.route("**/api/ai/logo-candidates", async (route) => {
            generations++;
            await generated.promise;
            await route.fulfill({
                json: {
                    status: true,
                    data: { images: [{ dataUrl: png, style: "geometric" }] },
                },
            });
        });
        const generation = page.waitForRequest("**/api/ai/logo-candidates");
        await page.getByRole("button", { name: "确认生成", exact: true })
            .click();
        await generation;
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.getByRole("button", { name: "收起图标设置", exact: true })
            .click();
        generated.resolve();
        await page.getByRole("button", { name: "更换图标", exact: true })
            .click();
        const candidate = page.getByRole("radio", {
            name: "选用第 1 个 AI 图标候选",
            exact: true,
        });
        await candidate.waitFor();
        assertEquals(
            await page.locator("#ai-description-input").inputValue(),
            "保留用途描述",
        );
        assertEquals(
            await page.locator("#ai-style-select").inputValue(),
            "geometric",
        );
        const uploadRelease = Promise.withResolvers<void>();
        let uploads = 0;
        await page.route("**/api/webapp-icons/upload", async (route) => {
            uploads++;
            await uploadRelease.promise;
            await route.fulfill({ response: await route.fetch() });
        });
        const upload = page.waitForRequest("**/api/webapp-icons/upload");
        await candidate.click();
        await upload;
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole("tab", { name: "网络图片", exact: true }).click();
        await page.locator('input[placeholder="https://example.com/icon.png"]')
            .fill("https://manual.invalid/icon.png");
        const uploaded = page.waitForResponse("**/api/webapp-icons/upload");
        uploadRelease.resolve();
        await uploaded;
        assertEquals(
            await page.locator('img[src^="/api/webapp-icons/"]').count(),
            0,
        );
        await page.getByRole("tab", { name: "AI 生成", exact: true }).click();
        await candidate.waitFor();
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await page.getByRole("button", { name: "放弃修改", exact: true })
            .click();
        await page.getByRole("button", { name: "添加应用", exact: true })
            .click();
        await page.getByRole("button", { name: "更换图标", exact: true })
            .click();
        await page.getByRole("tab", { name: "AI 生成", exact: true }).click();
        await page.locator("#ai-description-input").waitFor();
        assertEquals(
            await page.locator("#ai-description-input").inputValue(),
            "",
        );
        assertEquals(await candidate.count(), 0);
        assertEquals(generations, 1);
        assertEquals(uploads, 1);
        assertEquals(metadataRequests, 2);
    } finally {
        await browser.close();
        await app.close();
    }
});
