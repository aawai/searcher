import { assertEquals } from "@std/assert";
import type { Locator, Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

// A5 / 2.4.3 (#370 B5): when the control holding focus disappears (its item
// is moved to the trash, restored or deleted), focus returns to the
// container it lived in instead of dropping to <body>.

/**
 * The focused element's role and label once focus reaches `label` (or, if it
 * never does within a few seconds, wherever it settled, for the diff).
 */
async function focusLanding(page: Page, label: string) {
    await page.waitForFunction(
        (label) => document.activeElement?.getAttribute("aria-label") === label,
        label,
        { timeout: 3000 },
    ).catch(() => {});
    return await page.evaluate(() => {
        const active = document.activeElement;
        return {
            role: active?.getAttribute("role") ?? null,
            label: active?.getAttribute("aria-label") ?? active?.tagName,
        };
    });
}

async function openMenu(page: Page, item: Locator) {
    await item.focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menu").waitFor();
}

Deno.test("触发控件被移除后焦点回到所在容器，不落到 body #370", async () => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/", user);
        await page.evaluate(async () => {
            const post = (path: string, body: unknown) =>
                fetch(path, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }).then((response) => {
                    if (!response.ok) throw new Error(path);
                });
            await fetch("/api/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ showHomeApps: true }),
            });
            for (const name of ["甲", "乙"]) {
                await post("/api/webapps", {
                    name,
                    url: `https://${encodeURIComponent(name)}.example/`,
                    groupId: null,
                    iconSource: "default",
                    openMode: "global",
                    isHomeFixed: true,
                });
            }
            await post("/api/documents", { title: "待删笔记", body: "x" });
        });
        await page.reload();

        // The menu returns focus to the tile, then the tile leaves the grid.
        await openMenu(page, page.getByRole("button", { name: "打开 甲" }));
        await page.getByRole("menuitem", { name: "移至回收站" }).click();
        assertEquals(await focusLanding(page, "应用库"), {
            role: "group",
            label: "应用库",
        });

        // A confirmation dialog closes while its trigger row is gone.
        await page.goto(`${app.origin}/?view=notes`);
        const note = page.getByRole("treeitem", {
            name: "待删笔记",
            exact: true,
        });
        await openMenu(page, note);
        await page.getByRole("menuitem", { name: "移至回收站" }).click();
        await page.getByRole("alertdialog").getByRole("button", {
            name: "移至回收站",
        }).click();
        assertEquals(await focusLanding(page, "笔记本"), {
            role: "tree",
            label: "笔记本",
        });

        // Restoring removes the row whose button was pressed.
        await page.goto(`${app.origin}/trash`);
        const trash = page.locator('[data-window-id="trash"]');
        await trash.getByRole("button", { name: /恢复/ }).first().focus();
        await page.keyboard.press("Enter");
        assertEquals(await focusLanding(page, "已删除的应用"), {
            role: null,
            label: "已删除的应用",
        });
    } finally {
        await browser.close();
        await app.close();
    }
});
