import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Note card color dots have accessible names without visible labels and persist keyboard selection", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    await loginAndVisit(page, app.origin, "/", credentials);
    await page.evaluate(async () => {
        for (const color of ["paper", "amber", "rose", "sage", "sky"]) {
            const response = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: `颜色 ${color}`,
                    body: "正文保持不变",
                    color,
                    isHomeFixed: true,
                    layout: { deviceClass: "desktop", expanded: true },
                }),
            });
            if (!response.ok) throw new Error(await response.text());
        }
    });
    await page.reload();
    const cards = page.locator(".floating-notes .note-card");
    await cards.first().waitFor();
    for (const name of ["纸白", "琥珀", "玫瑰", "鼠尾草", "天空"]) {
        const trigger = page.getByRole("button", {
            name: `便签颜色：${name}`,
            exact: true,
        });
        await trigger.waitFor();
        assertEquals(await trigger.innerText(), "");
        await trigger.focus();
        await trigger.press("Enter");
        assertEquals(
            await page.getByRole("menuitemradio", { name, exact: true })
                .getAttribute("aria-checked"),
            "true",
        );
        await page.keyboard.press("Escape");
        await page.getByRole("menu").waitFor({ state: "detached" });
        await page.waitForFunction(
            (label) =>
                document.activeElement?.getAttribute("aria-label") === label,
            `便签颜色：${name}`,
        );
    }
    const card = cards.filter({ hasText: "颜色 paper" });
    const trigger = card.getByRole("button", {
        name: "便签颜色：纸白",
        exact: true,
    });
    await trigger.focus();
    await trigger.press("Enter");
    const option = page.getByRole("menuitemradio", {
        name: "鼠尾草",
        exact: true,
    });
    await option.focus();
    const saved = page.waitForResponse((response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/api/notes/") && response.ok()
    );
    await option.press("Enter");
    await saved;
    await page.getByRole("menu").waitFor({ state: "detached" });
    await page.reload();
    await card.getByRole("button", { name: "便签颜色：鼠尾草", exact: true })
        .waitFor();
    assertEquals(
        await card.locator(".note-preview").innerText(),
        "正文保持不变",
    );
    assertEquals(await card.locator(".note-color-trigger").innerText(), "");
});
