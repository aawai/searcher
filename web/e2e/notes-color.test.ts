import { assertEquals } from "@std/assert";
import { chromium } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Note card colour lives in the more menu with keyboard selection that persists", async () => {
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
    const colors = [
        ["paper", "纸白"],
        ["amber", "琥珀"],
        ["rose", "玫瑰"],
        ["sage", "鼠尾草"],
        ["sky", "天空"],
    ] as const;
    for (const [key, name] of colors) {
        const card = cards.filter({ hasText: `颜色 ${key}` });
        const trigger = card.getByRole("button", {
            name: "更多操作",
            exact: true,
        });
        await trigger.focus();
        await trigger.press("Enter");
        assertEquals(
            await page.getByRole("menuitemradio", { name, exact: true })
                .getAttribute("aria-checked"),
            "true",
        );
        await page.keyboard.press("Escape");
        await page.getByRole("menu").waitFor({ state: "detached" });
        assertEquals(
            await trigger.evaluate((el) => el === document.activeElement),
            true,
        );
    }
    const card = cards.filter({ hasText: "颜色 paper" });
    const trigger = card.getByRole("button", {
        name: "更多操作",
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
    await cards.first().waitFor();
    const reloaded = cards.filter({ hasText: "颜色 paper" });
    assertEquals(
        await reloaded.locator(".note-preview").innerText(),
        "正文保持不变",
    );
    await reloaded.hover();
    await reloaded.getByRole("button", { name: "更多操作", exact: true })
        .click();
    assertEquals(
        await page.getByRole("menuitemradio", { name: "鼠尾草", exact: true })
            .getAttribute("aria-checked"),
        "true",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "detached" });
});
