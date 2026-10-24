import { assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Home paper colour lives in the more menu with keyboard selection that persists", async () => {
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
            const response = await fetch("/api/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: `颜色 ${color}`,
                    body: "正文保持不变",
                    color,
                    isHomeFixed: true,
                }),
            });
            if (!response.ok) throw new Error(await response.text());
            const { id } = (await response.json()).data;
            const layout = await fetch(`/api/documents/${id}/layout`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deviceClass: "desktop",
                    expanded: true,
                }),
            });
            if (!layout.ok) throw new Error(await layout.text());
        }
    });
    await page.reload();
    const papers = page.locator(".floating-notes .note-card");
    await papers.first().waitFor();
    const colors = [
        ["paper", "纸白"],
        ["amber", "琥珀"],
        ["rose", "玫瑰"],
        ["sage", "鼠尾草"],
        ["sky", "天空"],
    ] as const;
    for (const [key, name] of colors) {
        const paper = papers.filter({ hasText: `颜色 ${key}` });
        const trigger = paper.getByRole("button", {
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
    const paper = papers.filter({ hasText: "颜色 paper" });
    const trigger = paper.getByRole("button", {
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
        new URL(response.url()).pathname.startsWith("/api/documents/") &&
        !response.url().includes("/layout") && response.ok()
    );
    await option.press("Enter");
    await saved;
    await page.getByRole("menu").waitFor({ state: "detached" });
    await page.reload();
    await papers.first().waitFor();
    const reloaded = papers.filter({ hasText: "颜色 paper" });
    assertEquals(
        (await reloaded.innerText()).includes("正文保持不变"),
        true,
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

Deno.test("Home paper menu changes color without moving the paper or persisting a desktop position", async () => {
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
    const documentId = await page.evaluate(async () => {
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "菜单不移动笔记",
                body: "保持自动布局",
                isHomeFixed: true,
            }),
        });
        return (await response.json()).data.id as string;
    });
    await page.reload();
    const paper = page.locator(".floating-notes .note-card").filter({
        has: page.getByRole("button", { name: "菜单不移动笔记", exact: true }),
    });
    await paper.hover();
    await paper.getByRole("button", { name: "更多操作", exact: true }).click();
    const changed = page.waitForResponse((response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/documents/${documentId}`)
    );
    await page.getByRole("menuitemradio", { name: "鼠尾草", exact: true })
        .click();
    assertEquals((await changed).ok(), true);
    await page.getByRole("menu").waitFor({ state: "detached" });
    const saved = await page.evaluate(async (id) => {
        const document = (await (await fetch(`/api/documents/${id}`)).json())
            .data;
        const layout = (await (await fetch(
            `/api/documents/${id}/layout?deviceClass=desktop`,
        )).json()).data;
        return {
            color: document.color,
            x: layout?.x ?? null,
            y: layout?.y ?? null,
        };
    }, documentId);
    assertEquals(saved, { color: "sage", x: null, y: null });
});
