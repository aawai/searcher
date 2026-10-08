import { assert, assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

async function sourceEditor(page: Page) {
    await page.getByRole("tab", { name: "源码", exact: true }).first().click();
    return page.locator("textarea.note-body-textarea").first();
}

Deno.test("production shortcuts for Notes and Ask (#103)", async (t) => {
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

    // Set widgets style as baseline so desktop dock is visible
    await page.goto(origin + "/settings/appearance");
    await page.getByText("空间轻桌面", { exact: true }).click();
    await page.locator('.layout-mode-card[aria-checked="true"]', {
        hasText: "空间轻桌面",
    }).waitFor();

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
        "Notes toolbar displays unified shortcut format in tooltips",
        async () => {
            await page.goto(origin);
            await page.locator("main").waitFor({ state: "visible" });

            // Open Notes workspace from Dock
            const dockNotesBtn = page.locator(
                '.desktop-dock button[aria-label="便签工作区"], .desktop-dock button[data-workspace="notes"]',
            ).first();
            await dockNotesBtn.waitFor({ state: "visible" });
            await dockNotesBtn.click();

            // Click create note button
            const createBtn = page.locator(
                'button:has-text("新建便签"), button[aria-label="新建便签"]',
            ).first();
            await createBtn.waitFor({ state: "visible" });
            await createBtn.click();

            const bodyInput = await sourceEditor(page);
            await bodyInput.waitFor({ state: "visible" });

            // Check toolbar button titles
            const boldBtn = page.locator(
                '.note-markdown-toolbar button[aria-label="粗体"]',
            );
            const italicBtn = page.locator(
                '.note-markdown-toolbar button[aria-label="斜体"]',
            );
            const linkBtn = page.locator(
                '.note-markdown-toolbar button[aria-label="链接"]',
            );
            const strikeBtn = page.locator(
                '.note-markdown-toolbar button[aria-label="删除线"]',
            );

            const boldTitle = await boldBtn.getAttribute("title");
            const italicTitle = await italicBtn.getAttribute("title");
            const linkTitle = await linkBtn.getAttribute("title");
            const strikeTitle = await strikeBtn.getAttribute("title");

            assert(
                boldTitle?.includes("Ctrl + B") || boldTitle?.includes("⌘ B"),
                `bold title: ${boldTitle}`,
            );
            assert(
                italicTitle?.includes("Ctrl + I") ||
                    italicTitle?.includes("⌘ I"),
                `italic title: ${italicTitle}`,
            );
            assert(
                linkTitle?.includes("Ctrl + K") || linkTitle?.includes("⌘ K"),
                `link title: ${linkTitle}`,
            );
            assert(
                strikeTitle?.includes("Ctrl + Shift + X") ||
                    strikeTitle?.includes("⌘ ⇧ X"),
                `strike title: ${strikeTitle}`,
            );
        },
    );

    await t.step(
        "Note K inserts link and does not steal focus to global search",
        async () => {
            const bodyInput = await sourceEditor(page);
            await bodyInput.waitFor({ state: "visible" });

            await bodyInput.fill("Check out omp documentation today");

            // Select "documentation" (index 10 to 27)
            await page.evaluate(() => {
                const el = document.querySelector(
                    "textarea.note-body-textarea",
                ) as HTMLTextAreaElement;
                el.focus();
                el.setSelectionRange(10, 27);
            });

            // Press Control+K
            await page.keyboard.press("Control+k");

            // Verify focus did NOT jump to global search input
            const activeElementIsTextarea = await page.evaluate(() => {
                const active = document.activeElement;
                return active?.tagName.toLowerCase() === "textarea" &&
                    active.classList.contains("note-body-textarea");
            });
            assert(
                activeElementIsTextarea,
                "Focus must stay on note body textarea after Control+k",
            );

            // Verify link markdown was inserted
            const updatedVal = await bodyInput.inputValue();
            assert(
                updatedVal.includes("[omp documentation]("),
                `Expected link markdown insertion, got: ${updatedVal}`,
            );

            // Verify search input was not touched
            const searchActive = await page.evaluate(
                () => document.activeElement?.closest(".search-form") !== null,
            );
            assertEquals(
                searchActive,
                false,
                "Global search must not be focused when Note K triggers",
            );
        },
    );

    await t.step(
        "Note B, I, strike (Shift+X), and S shortcuts execute correctly in editor",
        async () => {
            const bodyInput = await sourceEditor(page);
            await bodyInput.waitFor({ state: "visible" });

            // 1. Bold (Control+B)
            await bodyInput.fill("Bold text test");
            await page.evaluate(() => {
                const el = document.querySelector(
                    "textarea.note-body-textarea",
                ) as HTMLTextAreaElement;
                el.focus();
                el.setSelectionRange(0, 9);
            });
            await page.keyboard.press("Control+b");
            const boldVal = await bodyInput.inputValue();
            assert(
                boldVal.startsWith("**Bold text**"),
                `Expected bold formatting, got: ${boldVal}`,
            );

            // 2. Italic (Control+I)
            await bodyInput.fill("Italic text test");
            await page.evaluate(() => {
                const el = document.querySelector(
                    "textarea.note-body-textarea",
                ) as HTMLTextAreaElement;
                el.focus();
                el.setSelectionRange(0, 11);
            });
            await page.keyboard.press("Control+i");
            const italicVal = await bodyInput.inputValue();
            assert(
                italicVal.startsWith("*Italic text*"),
                `Expected italic formatting, got: ${italicVal}`,
            );

            // 3. Strike (Control+Shift+X)
            await bodyInput.fill("Strike text test");
            await page.evaluate(() => {
                const el = document.querySelector(
                    "textarea.note-body-textarea",
                ) as HTMLTextAreaElement;
                el.focus();
                el.setSelectionRange(0, 11);
            });
            await page.keyboard.press("Control+Shift+x");
            const strikeVal = await bodyInput.inputValue();
            assert(
                strikeVal.startsWith("~~Strike text~~"),
                `Expected strike formatting, got: ${strikeVal}`,
            );

            // 4. Save (Control+S)
            await bodyInput.fill("Unsaved draft content to test manual save");
            await page.keyboard.press("Control+s");
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "已保存",
                )
            );
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
            await page.locator(".ask-workspace-layout, .ask-composer-container")
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
