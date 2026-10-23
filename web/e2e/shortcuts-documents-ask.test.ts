import { assert, assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

async function pressRepeatedly(page: Page, key: string, times: number) {
    for (let i = 0; i < times; i++) await page.keyboard.press(key);
}

/** Selects the leading text; the editor may remount once after load, so retry until the browser selection matches. */
async function selectLeading(page: Page, length: number, expected: string) {
    const editor = page.locator(
        ".document-editor-scroll-area .ProseMirror[contenteditable='true']",
    );
    let selected = "";
    for (let attempt = 0; attempt < 5; attempt++) {
        await editor.focus();
        await page.keyboard.press("Control+Home");
        await pressRepeatedly(page, "Shift+ArrowRight", length);
        selected = await page.evaluate(() =>
            globalThis.getSelection()?.toString() ?? ""
        );
        if (selected === expected) {
            // ProseMirror ingests DOM selection on an async selectionchange; wait for it to flush.
            await page.evaluate(async () => {
                for (let frame = 0; frame < 2; frame++) {
                    const { promise, resolve } = Promise.withResolvers<
                        number
                    >();
                    requestAnimationFrame(resolve);
                    await promise;
                }
            });
            return;
        }
        await page.waitForFunction(() =>
            document.querySelector(
                    ".document-editor-scroll-area .ProseMirror.ProseMirror-focused",
                ) !== null || document.activeElement === document.body
        );
    }
    throw new Error(
        `selection never became "${expected}", last: "${selected}"`,
    );
}

async function openShortcutDocument(
    page: Page,
    origin: string,
    title: string,
    body: string,
) {
    await page.evaluate(async ({ title, body }) => {
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, body }),
        });
        if (!response.ok) throw new Error(await response.text());
    }, { title, body });
    await page.goto(origin);
    await page.locator("main").waitFor({ state: "visible" });
    await page.locator('button[data-workspace="documents"]').first().click();
    await page.locator("[data-document-id] h4 button").filter({
        hasText: title,
    }).first().click();
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    const editor = page.locator(
        ".document-editor-scroll-area .ProseMirror[contenteditable='true']",
    ).filter({ hasText: body });
    await editor.waitFor({ state: "visible" });
    await editor.focus();
    await page.locator(
        ".document-editor-scroll-area .ProseMirror.ProseMirror-focused",
    ).waitFor({ state: "visible" });
    return editor;
}

Deno.test("production shortcuts for Documents and Ask (#103)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir();
    cleanup.defer(() => Deno.removeSync(files, { recursive: true }));
    const store = openDatabase(":memory:");
    cleanup.defer(() => store.close());
    await migrateDatabase(store);
    const server = Deno.serve({
        hostname: "127.0.0.1",
        port: 0,
        onListen() {},
        handler: (request) => app.fetch(request),
    });
    cleanup.defer(() => server.shutdown());
    const origin = `http://127.0.0.1:${server.addr.port}`;
    const auth = new AuthService({ store, origin });
    const app = createApp({
        store,
        auth,
        origin,
        settings: new SystemSettingsStore(":memory:"),
        wallpaper: new WallpaperService(`${files}/wallpapers`),
        icons: new WebAppIconService(`${files}/icons`),
    });
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    // Register test user
    const username = "shortcuts_tester";
    const password = "Shortcuts-password-103!";
    // Register user via UI
    await page.goto(origin + "/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Shortcuts Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });

    // Seed AI provider and model for test user so Ask composer is rendered
    await store.exclusiveNative((native) => {
        const userRow = native.prepare(
            "SELECT id FROM users WHERE username = ?",
        ).get(username) as { id: string };
        const now = Date.now();
        native.prepare(
            "INSERT INTO ai_providers (id, owner_user_id, scope, name, base_url, encrypted_api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
            "test_p1",
            userRow.id,
            "user",
            "Mock Provider",
            "https://example.com/v1",
            "enc",
            now,
            now,
        );
        native.prepare(
            "INSERT INTO ai_models (id, provider_id, model_id, display_name, updated_at) VALUES (?, ?, ?, ?, ?)",
        ).run("test_m1", "test_p1", "mock-chat", "Mock Chat Model", now);
        return Promise.resolve();
    });

    await t.step(
        "documents Control+K link shortcut does not steal focus to global search",
        async () => {
            await openShortcutDocument(
                page,
                origin,
                "Shortcut link",
                "Check out omp documentation today",
            );
            await page.keyboard.press("Control+Home");
            await pressRepeatedly(page, "ArrowRight", 10);
            await pressRepeatedly(page, "Shift+ArrowRight", 17);
            await page.keyboard.press("Control+k");
            const searchFocused = await page.evaluate(
                () => document.activeElement?.closest(".search-form") !== null,
            );
            assertEquals(
                searchFocused,
                false,
                "Global search must not be focused when Control+K triggers",
            );
        },
    );

    await t.step(
        "documents Control+B formats the selection as bold",
        async () => {
            await openShortcutDocument(
                page,
                origin,
                "Shortcut bold",
                "Bold text test",
            );
            await selectLeading(page, 9, "Bold text");
            await page.keyboard.press("Control+b");
            await page.locator(
                ".document-editor-scroll-area .ProseMirror strong",
            )
                .filter({ hasText: "Bold text" }).waitFor({ state: "visible" });
        },
    );

    await t.step(
        "documents Control+I formats the selection as italic",
        async () => {
            await openShortcutDocument(
                page,
                origin,
                "Shortcut italic",
                "Italic text test",
            );
            await selectLeading(page, 11, "Italic text");
            await page.keyboard.press("Control+i");
            await page.locator(".document-editor-scroll-area .ProseMirror em")
                .filter({ hasText: "Italic text" }).waitFor({
                    state: "visible",
                });
        },
    );

    await t.step(
        "documents Control+Shift+X strikes the selection",
        async () => {
            await openShortcutDocument(
                page,
                origin,
                "Shortcut strike",
                "Strike text test",
            );
            await selectLeading(page, 11, "Strike text");
            await page.keyboard.press("Control+Shift+x");
            await page.locator(
                ".document-editor-scroll-area .ProseMirror :is(s, del)",
            ).filter({ hasText: "Strike text" }).waitFor({ state: "visible" });
        },
    );

    await t.step(
        "documents Control+S saves an edited document",
        async () => {
            await openShortcutDocument(
                page,
                origin,
                "Shortcut save",
                "Unsaved draft",
            );
            await page.keyboard.press("Control+End");
            await page.keyboard.type(" content to test manual save");
            await page.keyboard.press("Control+s");
            await page.locator('.document-save-status[data-status="saved"]')
                .waitFor({ state: "visible" });
        },
    );

    await t.step(
        "Ask F opens conversation search dialog from composer and non-Ask does not register",
        async () => {
            // First test on Home page (non-Ask): Control+F should NOT open Ask conversation search
            await page.goto(origin);
            await page.locator("main").waitFor({ state: "visible" });
            await page.keyboard.press("Control+f");
            const dialogCountOnHome = await page.locator('[role="dialog"]')
                .count();
            assertEquals(
                dialogCountOnHome,
                0,
                "Non-Ask page must not open conversation search dialog on Control+F",
            );

            // Navigate to Ask page
            await page.goto(origin + "/ask");
            await page.locator(".ask-workspace-layout")
                .waitFor({ state: "visible" });

            const composer = page.locator(".ask-composer__textarea");
            await composer.waitFor({ state: "visible" });
            await composer.focus();

            // In Ask composer: press Control+F
            await page.keyboard.press("Control+f");

            // Conversation search dialog must appear
            const searchDialog = page.locator('[role="dialog"]').filter({
                hasText: "会话内搜索",
            });
            await searchDialog.waitFor({ state: "visible" });

            // Verify description has the unified shortcut hint
            const descText = await searchDialog.textContent();
            assert(
                descText?.includes("快捷键: Ctrl + F") ||
                    descText?.includes("快捷键: ⌘ F"),
                `dialog description: ${descText}`,
            );

            // Close search dialog
            await page.keyboard.press("Escape");
            await searchDialog.waitFor({ state: "hidden" });
        },
    );
});
