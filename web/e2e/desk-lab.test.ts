import { assert, assertEquals } from "@std/assert";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { startProductionApp } from "./helpers/production-app.ts";

const status = (page: Page) => page.locator(".lab-desk-status").innerText();
const focused = (page: Page) =>
    page.evaluate(() =>
        document.activeElement?.getAttribute("data-desk-object") ??
            document.activeElement?.getAttribute("aria-label") ?? null
    );

/** Dispatches one wheel event on the desk and reports whether it was claimed. */
function wheel(page: Page, deltaY: number, ctrlKey = false) {
    return page.locator(".lab-desk-desk").evaluate(
        (desk, init) => {
            const event = new WheelEvent("wheel", {
                ...init,
                bubbles: true,
                cancelable: true,
            });
            desk.dispatchEvent(event);
            return event.defaultPrevented;
        },
        { deltaY, ctrlKey },
    );
}

async function waitForStage(page: Page, label: string) {
    await page.waitForFunction(
        (text) =>
            document.querySelector(".lab-desk-status")?.textContent?.startsWith(
                `状态：${text}`,
            ),
        label,
    );
}

Deno.test("desk lab moves between 静 and 览 by keyboard, wheel and pinch #240", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${app.origin}/design-lab/desk`);
        await page.waitForSelector(".lab-desk-home");

        // Keyboard: Mod+. enters 览 on the first object; arrows move by space.
        await page.keyboard.press("Control+.");
        await waitForStage(page, "览");
        await page.waitForFunction(() =>
            document.activeElement?.getAttribute("data-desk-object") === "notes"
        );
        await page.keyboard.press("ArrowRight");
        assertEquals(await focused(page), "conversations");
        await page.keyboard.press("ArrowDown");
        assertEquals(await focused(page), "paper:ideas");
        await page.keyboard.press("ArrowLeft");
        assertEquals(await focused(page), "notes");

        // Detail: Enter opens it beside the desk; Escape closes one layer.
        await page.keyboard.press("Enter");
        await page.getByRole("complementary", { name: "笔记详情" }).waitFor();
        await page.waitForFunction(() =>
            document.activeElement?.getAttribute("aria-label") === "关闭详情"
        );
        assertEquals(
            await page.locator("[data-desk-object='notes']").getAttribute(
                "aria-pressed",
            ),
            "true",
        );
        await page.keyboard.press("Escape");
        await page.waitForFunction(() =>
            document.activeElement?.getAttribute("data-desk-object") === "notes"
        );
        assert((await status(page)).startsWith("状态：览"));
        await page.keyboard.press("Escape");
        await waitForStage(page, "静");

        // Wheel: a burst down leaves 静; a burst up from the top returns.
        assertEquals(await wheel(page, 40), true);
        assertEquals(await wheel(page, 50), true);
        await waitForStage(page, "览");
        assertEquals(await wheel(page, -100), true);
        await waitForStage(page, "静");

        // Pinch (ctrl+wheel) claims only the direction that changes stage:
        // zooming in at 静 stays the browser's page zoom.
        assertEquals(await wheel(page, -30, true), false);
        assertEquals(await wheel(page, 30, true), true);
        await waitForStage(page, "览");
        assertEquals(await wheel(page, 30, true), false);
        assertEquals(await wheel(page, -30, true), true);
        await waitForStage(page, "静");

        // Opening a paper from 静 returns to 静 and to that paper.
        await page.locator("[data-desk-object='home-paper:ideas']").click();
        await page.getByRole("complementary", { name: "灵感详情" }).waitFor();
        await page.getByRole("textbox", { name: "编辑灵感" }).fill("改过");
        await page.keyboard.press("Escape");
        const dialog = page.getByRole("alertdialog", {
            name: "放弃未保存的修改？",
        });
        await dialog.waitFor();
        await dialog.getByRole("button", { name: "放弃修改" }).click();
        await waitForStage(page, "静");
        await page.waitForFunction(() =>
            document.activeElement?.getAttribute("data-desk-object") ===
                "home-paper:ideas"
        );

        // Over the limit the desk degrades to a grouped list.
        await page.getByLabel("对象数").selectOption("144");
        await page.keyboard.press("Control+.");
        await waitForStage(page, "览 · 列表");
        assertEquals(await page.locator(".lab-desk-grid").count(), 0);
        assertEquals(
            await page.locator(".lab-desk-list h3").allInnerTexts(),
            ["笔记", "AI 对话", "应用", "文件夹", "首页纸张"],
        );
        await page.keyboard.press("Escape");
        await waitForStage(page, "静");

        // Guests cannot enter 览.
        await page.getByRole("switch", { name: "已登录" }).click();
        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.keyboard.press("Control+.");
        assertEquals(await wheel(page, 200), false);
        assert((await status(page)).startsWith("状态：静"));
        assertEquals(errors, []);
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("desk lab uses a Sheet with list and nested detail below 768px #240", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({
            viewport: { width: 390, height: 844 },
            hasTouch: true,
        });
        await page.goto(`${app.origin}/design-lab/desk`);
        await page.waitForSelector(".lab-desk-home");
        await page.keyboard.press("Control+.");
        const sheet = page.getByRole("dialog", { name: "桌面" });
        await sheet.waitFor();
        await page.waitForFunction(() =>
            document.activeElement?.getAttribute("data-desk-object") === "notes"
        );
        await page.keyboard.press("Enter");
        await page.getByRole("dialog", { name: "笔记" }).waitFor();
        await page.waitForFunction(() =>
            document.activeElement?.getAttribute("aria-label") === "返回桌面"
        );
        await page.keyboard.press("Escape");
        await page.getByRole("dialog", { name: "桌面" }).waitFor();
        await page.keyboard.press("Escape");
        await waitForStage(page, "静");
        await page.getByRole("dialog").waitFor({ state: "detached" });
    } finally {
        await browser.close();
        await app.close();
    }
});
