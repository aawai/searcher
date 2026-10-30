import { assert, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { openNoteRows } from "./helpers/library.ts";

Deno.test("Documents long document actions and menus stay reachable without replacing the editor", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const credentials = await app.seedAskFixtureUser({
        username: "doc_ux_user",
        password: "Doc-ux-pass-123!",
    });
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    await loginAndVisit(page, app.origin, "/", credentials);
    const id = await page.evaluate(async () => {
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "长文操作",
                body: "原始正文\n\n".repeat(100),
            }),
        });
        if (!response.ok) throw new Error("Cannot create document");
        return (await response.json()).data.id as string;
    });
    await page.reload();
    await openNoteRows(page);
    await page.locator(`[data-document-id="${id}"] h4 button`).click();
    const editorRoot = page.locator(".document-editor-container");
    const live = editorRoot.locator(".ProseMirror");
    await live.waitFor();
    const bounds = await editorRoot.boundingBox();
    assert(
        bounds && bounds.height <= 844,
        "Long content must not push actions below the host",
    );
    await live.evaluate((element) =>
        element.setAttribute("data-instance-proof", "original")
    );

    // Header actions are reachable with the keyboard and in the viewport.
    const more = page.getByRole("button", {
        name: "更多笔记操作",
        exact: true,
    });
    const history = page.getByRole("button", { name: "历史", exact: true });
    for (const control of [more, history]) {
        const box = await control.boundingBox();
        assert(
            box && box.y >= 0 && box.y + box.height <= 844,
            "header action is inside the viewport",
        );
    }
    await more.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await menu.waitFor({ state: "visible" });
    assertEquals(
        await page.getByRole("menuitem", { name: "固定到首页", exact: true })
            .count(),
        1,
    );
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    assertEquals(
        await more.evaluate((el) => el === document.activeElement),
        true,
        "focus returns to the menu trigger",
    );

    // History opens and closes without remounting the editor.
    await history.click();
    const dialog = page.getByRole("dialog", { name: "历史版本" });
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assertEquals(
        await live.getAttribute("data-instance-proof"),
        "original",
        "history and menus must not replace the rich editor instance",
    );
});
